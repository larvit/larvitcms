'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	topLogPrefix	= 'larvitcms: dataWriter.js: ',
	DbMigration	= require('larvitdbmigration'),
	Intercom	= require('larvitamintercom'),
	checkKey	= require('check-object-key'),
	slugify	= require('larvitslugify'),
	lUtils	= require('larvitutils'),
	amsync	= require('larvitamsync'),
	async	= require('async'),
	that	= this,
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false;

function listenToQueue(retries, cb) {
	const	logPrefix	= topLogPrefix + 'listenToQueue() - ',
		options	= {'exchange': exports.exchangeName},
		tasks	= [];

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (retries === undefined) {
		retries = 0;
	}

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'mode',
			'validValues':	['master', 'slave', 'noSync'],
			'default':	'noSync'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'intercom',
			'default':	new Intercom('loopback interface'),
			'defaultLabel':	'loopback interface'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		if (exports.mode === 'master') {
			listenMethod	= 'consume';
			options.exclusive	= true;	// It is important no other client tries to sneak
			// out messages from us, and we want "consume"
			// since we want the queue to persist even if this
			// minion goes offline.
		} else if (exports.mode === 'slave' || exports.mode === 'noSync') {
			listenMethod = 'subscribe';
		} else {
			const	err	= new Error('Invalid exports.mode. Must be either "master", "slave" or "noSync"');
			log.error(logPrefix + err.message);
			return cb(err);
		}

		log.info(logPrefix + 'listenMethod: ' + listenMethod);

		cb();
	});

	tasks.push(function (cb) {
		exports.intercom.ready(cb);
	});

	tasks.push(function (cb) {
		exports.intercom[listenMethod](options, function (message, ack, deliveryTag) {
			exports.ready(function (err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof exports[message.action] === 'function') {
					exports[message.action](message.params, deliveryTag, message.uuid);
				} else {
					log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			});
		}, cb);
	});

	async.series(tasks, cb);
}
// Run listenToQueue as soon as all I/O is done, this makes sure the exports.mode can be set
// by the application before listening commences
setImmediate(listenToQueue);

// This is ran before each incoming message on the queue is handeled
function ready(retries, cb) {
	const	logPrefix	= topLogPrefix + 'ready() - ',
		tasks	= [];

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb	= function (){};
	}

	if (retries === undefined) {
		retries	= 0;
	}

	if (isReady === true) return cb();

	if (readyInProgress === true) {
		eventEmitter.on('ready', cb);
		return;
	}

	readyInProgress = true;

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'options',
			'default':	{}
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'mode',
			'validValues':	['master', 'slave', 'noSync'],
			'default':	'noSync'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'intercom',
			'default':	new Intercom('loopback interface'),
			'defaultLabel':	'loopback interface'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		if (exports.mode === 'slave') {
			log.verbose(logPrefix + 'exports.mode: "' + exports.mode + '", so read');

			amsync.mariadb({
				'exchange':	exports.exchangeName + '_dataDump',
				'intercom':	exports.intercom
			}, cb);
		} else {
			cb();
		}
	});

	// Migrate database
	tasks.push(function (cb) {
		const	options	= {};

		let	dbMigration;

		options.dbType	= 'larvitdb';
		options.dbDriver	= db;
		options.tableName	= 'cms_db_version';
		options.migrationScriptsPath	= __dirname + '/dbmigration';
		dbMigration	= new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				log.error(logPrefix + 'Database error: ' + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) return;

		isReady	= true;
		eventEmitter.emit('ready');

		if (exports.mode === 'master') {
			runDumpServer(cb);
		} else {
			cb();
		}
	});
}

function runDumpServer(cb) {
	const	options	= {
			'exchange': exports.exchangeName + '_dataDump',
			'amsync': {
				'host': that.options.amsync ? that.options.amsync.host : null,
				'minPort': that.options.amsync ? that.options.amsync.minPort : null,
				'maxPort': that.options.amsync ? that.options.amsync.maxPort : null
			}
		},
		args	= [];

	if (db.conf.host) {
		args.push('-h');
		args.push(db.conf.host);
	}

	args.push('-u');
	args.push(db.conf.user);

	if (db.conf.password) {
		args.push('-p' + db.conf.password);
	}

	args.push('--single-transaction');
	args.push('--hex-blob');
	args.push(db.conf.database);

	// Tables
	args.push('cms_db_version');
	args.push('cms_pages');
	args.push('cms_pagesData');
	args.push('cms_snippets');

	options.dataDumpCmd = {
		'command':	'mysqldump',
		'args':	args
	};

	options['Content-Type'] = 'application/sql';
	options.intercom	= exports.intercom;

	new amsync.SyncServer(options, cb);
}

function rmPage(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'rmPage() - ',
		options	= params.data,
		tasks	= [];

	if (options.uuid === 'undefined ') {
		const	err	= new Error('pageUuid not provided');
		log.warn(logPrefix + err.message);
		return exports.emitter.emit(msgUuid, err);
	}

	tasks.push(ready);

	tasks.push(function (cb) {
		db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	tasks.push(function (cb) {
		db.query('DELETE FROM cms_pages WHERE uuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

function savePage(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'savePage() - ',
		options	= params.data,
		tasks	= [];

	let	lang;

	if (options.uuid === 'undefined ') {
		const	err	= new Error('pageUuid not provided');
		log.warn(logPrefix + err.message);
		return exports.emitter.emit(msgUuid, err);
	}

	log.debug(logPrefix + 'Running with data. "' + JSON.stringify(params.data) + '"');

	tasks.push(ready);

	tasks.push(function (cb) {
		db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	tasks.push(function (cb) {
		db.query('DELETE FROM cms_pages WHERE uuid = ?', [lUtils.uuidToBuffer(options.uuid)], cb);
	});

	tasks.push(function (cb) {
		const	dbFields	= [lUtils.uuidToBuffer(options.uuid), options.name];

		let	sql	= 'INSERT INTO cms_pages (uuid,name';

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

		db.query(sql, dbFields, cb);
	});

	// We need to declare this outside the loop because of async operations
	function addEntryData(lang, htmlTitle, body1, body2, body3, body4, body5, slug) {
		tasks.push(function (cb) {
			const	dbFields	= [lUtils.uuidToBuffer(options.uuid), lang, htmlTitle, body1, body2, body3, body4, body5, slug],
				sql	= 'INSERT INTO cms_pagesData (pageUuid, lang, htmlTitle, body1, body2, body3, body4, body5, slug) VALUES(?,?,?,?,?,?,?,?,?);';

			db.query(sql, dbFields, cb);
		});
	}

	// Add content data
	if (options.langs) {
		for (lang in options.langs) {
			if (options.langs[lang].slug) {
				options.langs[lang].slug = slugify(options.langs[lang].slug, {'save': ['_', '/']});
			}

			if ( ! options.langs[lang].slug) {
				options.langs[lang].slug = slugify(options.langs[lang].htmlTitle, {'save': ['_', '/']});
			}

			if ( ! options.langs[lang].htmlTitle)	options.langs[lang].htmlTitle	= '';
			if ( ! options.langs[lang].body1)	options.langs[lang].body1	= '';
			if ( ! options.langs[lang].body2)	options.langs[lang].body2	= '';
			if ( ! options.langs[lang].body3)	options.langs[lang].body3	= '';
			if ( ! options.langs[lang].body4)	options.langs[lang].body4	= '';
			if ( ! options.langs[lang].body5)	options.langs[lang].body5	= '';

			addEntryData(lang, options.langs[lang].htmlTitle, options.langs[lang].body1, options.langs[lang].body2, options.langs[lang].body3, options.langs[lang].body4, options.langs[lang].body5, options.langs[lang].slug);
		}
	}

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

function saveSnippet(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'saveSnippet() - ',
		options	= params.data,
		sql	= 'REPLACE INTO cms_snippets (body, slug, lang) VALUES(?,?,?);',
		dbFields	= [options.body, options.slug, options.lang],
		tasks	= [];

	if (options.slug === undefined) {
		const	err	= new Error('slug not provided');
		log.warn(logPrefix + err.message);
		return exports.emitter.emit(msgUuid, err);
	}

	tasks.push(ready);

	tasks.push(function (cb) {
		db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

exports.emitter	= new EventEmitter();
exports.exchangeName	= 'larvitcms';
exports.options	= undefined;
exports.ready	= ready;
exports.rmPage	= rmPage;
exports.savePage	= savePage;
exports.saveSnippet	= saveSnippet;
