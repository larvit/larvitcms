/* eslint-disable no-tabs */
'use strict';

const topLogPrefix = 'larvitcms: ./cms.js: ';
const DataWriter = require(__dirname + '/dataWriter.js');
const LUtils = require('larvitutils');
const log = require('winston');
const db = require('larvitdb');

class Cms {
	constructor(options, cb) {
		this.options = options || {};

		if (!options.db) throw new Error('Missing required option "db"');

		if (!options.lUtils) options.lUtils = new LUtils();

		if (!this.options.log) {
			const lUtils = new LUtils();

			this.options.log = new lUtils.Log();
		}

		this.log = this.options.log;

		for (const key of Object.keys(this.options)) {
			this[key] = this.options[key];
		}

		if (!this.exchangeName) {
			this.exchangeName = 'larvitcms';
		}

		if (!this.mode) {
			this.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
			this.mode = 'noSync';
		} else if (['noSync', 'master', 'slave'].indexOf(this.mode) === -1) {
			const err = new Error('Invalid "mode" option given: "' + this.mode + '"');

			this.log.error(logPrefix + err.message);
			throw err;
		}

		if (!this.intercom) {
			this.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
			this.intercom = new Intercom('loopback interface');
		}

		this.dataWriter = new DataWriter({
			exchangeName: this.exchangeName,
			intercom: this.intercom,
			mode: this.mode,
			log: this.log,
			db: this.db,
			amsync_host: this.options.amsync_host || null,
			amsync_minPort: this.options.amsync_minPort || null,
			amsync_maxPort: this.options.amsync_maxPort || null
		}, cb);
	};

	getPages(options, cb) {
		const logPrefix = topLogPrefix + 'getPages() - ';
		const tmpPages = {};
		const dbFields = [];
		const pages = [];

		let sql;

		if (typeof options === 'function') {
			cb = options;
			options = {};
		}

		this.log.debug(logPrefix + 'Called with options: "' + JSON.stringify(options) + '"');

		// Make sure options that should be arrays actually are arrays
		// This will simplify our lives in the SQL builder below
		if (options.langs !== undefined && !(options.langs instanceof Array)) {
			options.langs = [options.langs];
		}

		if (options.uuids !== undefined && !(options.ids instanceof Array)) {
			options.uuids = [options.uuids];
		}

		if (options.slugs !== undefined && !(options.slugs instanceof Array)) {
			options.slugs = [options.slugs];
		}

		// Make sure there is an invalid ID in the id list if it is empty
		// Since the most logical thing to do is replying with an empty set
		if (options.uuids instanceof Array && options.uuids.length === 0) {
			options.uuids.push('');
		}

		if (options.limit === undefined) {
			options.limit = 10;
		}

		sql = 'SELECT pgd.*, p.*\n';
		sql += 'FROM cms_pages p\n';
		sql += '	LEFT JOIN cms_pagesData pgd ON pgd.pageUuid = p.uuid\n';
		sql += 'WHERE 1 + 1\n';

		// Only get post contents with selected languages
		if (options.langs !== undefined) {
			sql += '	AND pgd.lang IN (';

			for (let i = 0; options.langs[i] !== undefined; i++) {
				sql += '?,';
				dbFields.push(options.langs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		// Only get posts with the current slugs
		if (options.slugs !== undefined) {
			sql += '	AND p.uuid IN (SELECT pageUuid FROM cms_pagesData WHERE slug IN (';

			for (let i = 0; options.slugs[i] !== undefined; i++) {
				sql += '?,';
				dbFields.push(options.slugs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + '))\n';
		}

		// Only get posts with given ids
		if (options.uuids !== undefined) {
			sql += '	AND p.uuid IN (';

			for (let i = 0; options.uuids[i] !== undefined; i++) {
				const buffer = this.lUtils.uuidToBuffer(options.uuids[i]);

				if (buffer === false) {
					const e = new Error('Invalid page uuid supplied');

					log.warn(logPrefix + e.message);

					return cb(e);
				}

				sql += '?,';
				dbFields.push(buffer);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		if (options.published === true) {
			sql += '	AND p.published = 1\n';
		} else if (options.published === false) {
			sql += '	AND p.published = 0\n';
		}

		sql += 'ORDER BY p.published DESC, p.name\n';

		if (options.limit !== false) {
			sql += 'LIMIT ' + Number(options.limit) + '\n';

			if (options.offset !== undefined) {
				sql += ' OFFSET ' + Number(options.offset);
			}
		}

		this.db.query(sql, dbFields, (err, rows) => {
			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i++) {
				const uuid = this.lUtils.formatUuid(rows[i].uuid);

				if (tmpPages[uuid] === undefined) {
					tmpPages[uuid] = {
						uuid: uuid,
						name: rows[i].name,
						published: Boolean(rows[i].published),
						template: rows[i].template,
						langs: {}
					};
				}

				tmpPages[uuid].langs[rows[i].lang] = {
					htmlTitle: rows[i].htmlTitle,
					body1: rows[i].body1,
					body2: rows[i].body2,
					body3: rows[i].body3,
					body4: rows[i].body4,
					body5: rows[i].body5,
					slug: rows[i].slug
				};
			}

			for (const pageUuid in tmpPages) {
				pages.push(tmpPages[pageUuid]);
			}

			cb(null, pages);
		});
	};

	getSnippets(options, cb) {
		const dbFields = [];
		let sql;

		if (typeof options === 'function') {
			cb = options;
			options = {};
		}

		if (options.onlyNames) {
			sql = 'SELECT DISTINCT name FROM cms_snippets ORDER BY name;';
			db.query(sql, cb);

			return;
		}

		sql = 'SELECT * FROM cms_snippets\n';
		sql += 'WHERE 1 + 1\n';

		if (options.names !== undefined) {
			if (typeof options.names === 'string') {
				options.names = [options.names];
			}

			if (options.names.length === 0) {
				options.names = [''];
			}

			sql += '	AND name IN (';

			for (let i = 0; options.names[i] !== undefined; i++) {
				sql += '?,';
				dbFields.push(options.names[i]);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		sql += 'ORDER BY name, lang';

		this.db.query(sql, dbFields, (err, rows) => {
			const snippets = [];

			let snippet;
			let prevName;

			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i++) {
				if (prevName !== rows[i].name) {
					if (snippet) {
						snippets.push(snippet);
					}

					snippet = {name: rows[i].name, langs: {}};
				}

				prevName = rows[i].name;
				snippet.langs[rows[i].lang] = rows[i].body;
			}

			// Add the last one
			if (snippet) {
				snippets.push(snippet);
			}

			cb(null, snippets);
		});
	}

	rmPage(uuid, cb) {
		const options = {exchange: this.exchangeName};
		const message = {};

		message.action = 'rmPage';
		message.params = {};

		message.params.data = {uuid: uuid};

		this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
			if (err) return cb(err);

			this.dataWriter.emitter.once(msgUuid, cb);
		});
	}

	rmSnippet(name, cb) {
		const options = {exchange: this.exchangeName};
		const message = {};

		message.action = 'rmSnippet';
		message.params = {};

		message.params.data = {name: name};

		this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
			if (err) return cb(err);

			this.dataWriter.emitter.once(msgUuid, cb);
		});
	}

	savePage(data, cb) {
		const options = {exchange: this.exchangeName};
		const message = {};

		message.action = 'savePage';
		message.params = {};

		message.params.data = data;

		this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
			if (err) return cb(err);

			this.dataWriter.emitter.once(msgUuid, cb);
		});
	};

	saveSnippet(data, cb) {
		const options = {exchange: this.exchangeName};
		const message = {};

		message.action = 'saveSnippet';
		message.params = {};

		message.params.data = data;

		this.dataWriter.intercom.send(message, options, (err, msgUuid) => {
			if (err) return cb(err);

			this.dataWriter.emitter.once(msgUuid, cb);
		});
	}
}

module.exports = exports = Cms;
