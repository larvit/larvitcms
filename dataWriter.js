'use strict';

const EventEmitter = require('events').EventEmitter;
const topLogPrefix = 'larvitcms: dataWriter.js: ';
const DbMigration = require('larvitdbmigration');
const slugify = require('larvitslugify');
const LUtils = require('larvitutils');
const amsync = require('larvitamsync');
const async = require('async');

let isReady = false;
let readyInProgress = false;
let emitter = new EventEmitter();

class DataWriter {
	static get emitter() { return emitter; }

	constructor(options) {
		if (!options.log) {
			const tmpLUtils = new LUtils();

			options.log = new tmpLUtils.Log();
		}

		this.options = options;

		for (const key of Object.keys(options)) {
			this[key] = options[key];
		}

		this.lUtils = new LUtils({log: this.log});

		this.listenToQueue();
	}

	listenToQueue(retries, cb) {
		const logPrefix = topLogPrefix + 'listenToQueue() - ';
		const options = {exchange: this.exchangeName};
		const tasks = [];

		let listenMethod;

		if (typeof retries === 'function') {
			cb = retries;
			retries = 0;
		}

		if (typeof cb !== 'function') {
			cb = function () {};
		}

		if (retries === undefined) {
			retries = 0;
		}

		tasks.push(cb => {
			if (this.mode === 'master') {
				listenMethod = 'consume';
				options.exclusive = true; // It is important no other client tries to sneak
				// out messages from us, and we want "consume"
				// since we want the queue to persist even if this
				// minion goes offline.
			} else if (this.mode === 'slave' || this.mode === 'noSync') {
				listenMethod = 'subscribe';
			} else {
				const err = new Error('Invalid this.mode. Must be either "master", "slave" or "noSync"');

				this.log.error(logPrefix + err.message);

				return cb(err);
			}

			this.log.info(logPrefix + 'listenMethod: ' + listenMethod);

			cb();
		});

		tasks.push(cb => {
			this.ready(cb);
		});

		tasks.push(cb => {
			this.intercom[listenMethod](options, (message, ack, deliveryTag) => {
				ack(); // Ack first, if something goes wrong we log it and handle it manually

				if (typeof message !== 'object') {
					this.log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');

					return;
				}

				if (typeof this[message.action] === 'function') {
					this[message.action](message.params, deliveryTag, message.uuid);
				} else {
					this.log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			}, cb);
		});

		async.series(tasks, cb);
	}

	// This is ran before each incoming message on the queue is handeled
	ready(retries, cb) {
		const logPrefix = topLogPrefix + 'ready() - ';
		const tasks = [];

		if (typeof retries === 'function') {
			cb = retries;
			retries = 0;
		}

		if (typeof cb !== 'function') {
			cb = function () {};
		}

		if (retries === undefined) {
			retries = 0;
		}

		if (isReady === true) return cb();

		if (readyInProgress === true) {
			DataWriter.emitter.on('ready', cb);

			return;
		}

		readyInProgress = true;

		tasks.push(cb => {
			if (this.mode === 'slave') {
				this.log.verbose(logPrefix + 'this.mode: "' + this.mode + '", so read');

				amsync.mariadb({
					exchange: this.exchangeName + '_dataDump',
					intercom: this.intercom
				}, cb);
			} else {
				cb();
			}
		});

		// Migrate database
		tasks.push(cb => {
			const options = {};

			let dbMigration;

			options.dbType = 'mariadb';
			options.dbDriver = this.db;
			options.tableName = 'cms_db_version';
			options.migrationScriptsPath = __dirname + '/dbmigration';
			dbMigration = new DbMigration(options);

			dbMigration.run(err => {
				if (err) {
					this.log.error(logPrefix + 'Database error: ' + err.message);
				}

				cb(err);
			});
		});

		async.series(tasks, err => {
			if (err) return;

			isReady = true;
			DataWriter.emitter.emit('ready');

			if (this.mode === 'master') {
				this.runDumpServer(cb);
			} else {
				cb();
			}
		});
	}

	runDumpServer(cb) {
		const options = {
			exchange: this.exchangeName + '_dataDump',
			host: this.options.amsync ? this.options.amsync.host : null,
			minPort: this.options.amsync ? this.options.amsync.minPort : null,
			maxPort: this.options.amsync ? this.options.amsync.maxPort : null
		};

		const args = [];

		if (this.db.conf.host) {
			args.push('-h');
			args.push(db.conf.host);
		}

		args.push('-u');
		args.push(this.db.conf.user);

		if (db.conf.password) {
			args.push('-p' + this.db.conf.password);
		}

		args.push('--single-transaction');
		args.push('--hex-blob');
		args.push(this.db.conf.database);

		// Tables
		args.push('cms_db_version');
		args.push('cms_pages');
		args.push('cms_pagesData');
		args.push('cms_snippets');

		options.dataDumpCmd = {
			command: 'mysqldump',
			args: args
		};

		options['Content-Type'] = 'application/sql';
		options.intercom = this.intercom;

		new amsync.SyncServer(options, cb);
	}

	rmPage(params, deliveryTag, msgUuid) {
		const logPrefix = topLogPrefix + 'rmPage() - ';
		const options = params.data;
		const uuidBuffer = this.lUtils.uuidToBuffer(options.uuid);
		const tasks = [];

		if (options.uuid === undefined) {
			const err = new Error('pageUuid not provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		if (uuidBuffer === false) {
			const err = new Error('Inavlid pageUuid provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		tasks.push(cb => this.ready(cb));

		tasks.push(cb => {
			this.db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [uuidBuffer], cb);
		});

		tasks.push(cb => {
			this.db.query('DELETE FROM cms_pages WHERE uuid = ?', [uuidBuffer], cb);
		});

		async.series(tasks, err => {
			DataWriter.emitter.emit(msgUuid, err);
		});
	}

	rmSnippet(params, deliveryTag, msgUuid) {
		const logPrefix = topLogPrefix + 'rmSnippet() - ';
		const options = params.data;
		const tasks = [];

		if (!options.name) {
			const err = new Error('snippet name not provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		tasks.push(cb => this.ready(cb));

		tasks.push(cb => {
			this.db.query('DELETE FROM cms_snippets WHERE name = ?', [options.name], cb);
		});

		async.series(tasks, err => {
			DataWriter.emitter.emit(msgUuid, err);
		});
	}

	savePage(params, deliveryTag, msgUuid) {
		const logPrefix = topLogPrefix + 'savePage() - ';
		const options = params.data;
		const uuidBuffer = this.lUtils.uuidToBuffer(options.uuid);
		const tasks = [];

		let lang;

		if (options.uuid === undefined) {
			const err = new Error('pageUuid not provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		if (uuidBuffer === false) {
			const err = new Error('Inavlid pageUuid provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		this.log.debug(logPrefix + 'Running with data. "' + JSON.stringify(params.data) + '"');

		tasks.push(cb => this.ready(cb));

		tasks.push(cb => {
			this.db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [uuidBuffer], cb);
		});

		tasks.push(cb => {
			this.db.query('DELETE FROM cms_pages WHERE uuid = ?', [uuidBuffer], cb);
		});

		tasks.push(cb => {
			const dbFields = [uuidBuffer, options.name];

			let sql = 'INSERT INTO cms_pages (uuid,name';

			if (options.published) {
				sql += ', published';
			}

			if (options.template) {
				sql += ', template';
			}

			sql += ') VALUES(?,?';

			if (options.published) {
				sql += ',?';
				dbFields.push(options.published);
			}

			if (options.template) {
				sql += ',?';
				dbFields.push(options.template);
			}

			sql += ');';

			this.db.query(sql, dbFields, cb);
		});

		// We need to declare this outside the loop because of async operations
		const addEntryData = (lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug) => {
			tasks.push(cb => {
				const dbFields = [uuidBuffer, lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug];


				const sql = 'INSERT INTO cms_pagesData (pageUuid, lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug) VALUES(?,?,?,?,?,?,?,?,?,?);';

				this.db.query(sql, dbFields, cb);
			});
		};

		// Add content data
		if (options.langs) {
			for (lang in options.langs) {
				if (options.langs[lang].slug) {
					options.langs[lang].slug = slugify(options.langs[lang].slug, {save: ['_', '-', '/']});
				}

				if (!options.langs[lang].slug) {
					options.langs[lang].slug = slugify(options.langs[lang].htmlTitle, {save: ['_', '-', '/']});
				}

				if (!options.langs[lang].htmlTitle) options.langs[lang].htmlTitle = '';
				if (!options.langs[lang].body1) options.langs[lang].body1 = '';
				if (!options.langs[lang].body2) options.langs[lang].body2 = '';
				if (!options.langs[lang].body3) options.langs[lang].body3 = '';
				if (!options.langs[lang].body4) options.langs[lang].body4 = '';
				if (!options.langs[lang].body5) options.langs[lang].body5 = '';
				if (!options.langs[lang].body6) options.langs[lang].body6 = '';

				addEntryData(lang, options.langs[lang].htmlTitle, options.langs[lang].body1, options.langs[lang].body2, options.langs[lang].body3, options.langs[lang].body4, options.langs[lang].body5, options.langs[lang].body6, options.langs[lang].slug);
			}
		}

		async.series(tasks, err => {
			DataWriter.emitter.emit(msgUuid, err);
		});
	}

	saveSnippet(params, deliveryTag, msgUuid) {
		const logPrefix = topLogPrefix + 'saveSnippet() - ';
		const options = params.data;
		const sql = 'REPLACE INTO cms_snippets (body, name, lang) VALUES(?,?,?);';
		const dbFields = [options.body, options.name, options.lang];
		const tasks = [];

		if (options.name === undefined) {
			const err = new Error('Name not provided');

			this.log.warn(logPrefix + err.message);

			return DataWriter.emitter.emit(msgUuid, err);
		}

		tasks.push(cb => this.ready(cb));

		tasks.push(cb => {
			this.db.query(sql, dbFields, cb);
		});

		async.series(tasks, err => {
			DataWriter.emitter.emit(msgUuid, err);
		});
	}
}

module.exports = exports = DataWriter;
