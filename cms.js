'use strict';

const	topLogPrefix	= 'larvitcms: ./cms.js: ',
	dataWriter	= require(__dirname + '/dataWriter.js'),
	lUtils	= require('larvitutils'),
	log	= require('winston'),
	db	= require('larvitdb');

/**
 * Get pages
 *
 * @param obj options	-	{ // All options are optional!
 *			'langs':	['sv', 'en'],
 *			'slugs':	['blu', 'bla'],
 *			'ids':	[32,4],
 *			'published':	true,	// Or false, to get both, set to undefined
 *			'limit':	10,	// Defaults to 10, explicitly give false to remove limit
 *			'offset':	20
 *		}
 * @param func cb - callback(err, pages)
 */
function getPages(options, cb) {
	dataWriter.ready(function (err) {
		const	logPrefix	= topLogPrefix + 'getPages() - ',
			tmpPages	= {},
			dbFields	= [],
			pages	= [];

		let	sql;

		if (err) return cb(err);

		if (typeof options === 'function') {
			cb	= options;
			options	= {};
		}

		log.debug(logPrefix + 'Called with options: "' + JSON.stringify(options) + '"');

		// Make sure options that should be arrays actually are arrays
		// This will simplify our lives in the SQL builder below
		if (options.langs !== undefined && ! (options.langs instanceof Array)) {
			options.langs = [options.langs];
		}

		if (options.uuids !== undefined && ! (options.ids instanceof Array)) {
			options.uuids = [options.uuids];
		}

		if (options.slugs !== undefined && ! (options.slugs instanceof Array)) {
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

		sql  = 'SELECT pgd.*, p.*\n';
		sql += 'FROM cms_pages p\n';
		sql += '	LEFT JOIN cms_pagesData pgd ON pgd.pageUuid = p.uuid\n';
		sql += 'WHERE 1 + 1\n';

		// Only get post contents with selected languages
		if (options.langs !== undefined) {
			sql += '	AND pgd.lang IN (';

			for (let i = 0; options.langs[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.langs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		// Only get posts with the current slugs
		if (options.slugs !== undefined) {
			sql += '	AND p.uuid IN (SELECT pageUuid FROM cms_pagesData WHERE slug IN (';

			for (let i = 0; options.slugs[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.slugs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + '))\n';
		}

		// Only get posts with given ids
		if (options.uuids !== undefined) {
			sql += '	AND p.uuid IN (';

			for (let i = 0; options.uuids[i] !== undefined; i ++) {
				const buffer = lUtils.uuidToBuffer(options.uuids[i]);

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
			sql += 'LIMIT ' + parseInt(options.limit) + '\n';

			if (options.offset !== undefined) {
				sql += ' OFFSET ' + parseInt(options.offset);
			}
		}

		db.query(sql, dbFields, function (err, rows) {
			for (let i = 0; rows[i] !== undefined; i ++) {
				const	uuid	= lUtils.formatUuid(rows[i].uuid);

				if (tmpPages[uuid] === undefined) {
					tmpPages[uuid] = {
						'uuid':	uuid,
						'name':	rows[i].name,
						'published':	Boolean(rows[i].published),
						'template':	rows[i].template,
						'langs':	{}
					};
				}

				tmpPages[uuid].langs[rows[i].lang] = {
					'htmlTitle':	rows[i].htmlTitle,
					'body1':	rows[i].body1,
					'body2':	rows[i].body2,
					'body3':	rows[i].body3,
					'body4':	rows[i].body4,
					'body5':	rows[i].body5,
					'slug':	rows[i].slug
				};
			}

			for (const pageUuid in tmpPages) {
				pages.push(tmpPages[pageUuid]);
			}

			cb(null, pages);
		});
	});
};

/**
 * Get snippets
 *
 * @param obj options - names....
 * @param func cb(err, names)
 */
function getSnippets(options, cb) {
	dataWriter.ready(function (err) {
		const	dbFields	= [];

		let	sql;

		if (err) return cb(err);

		if (typeof options === 'function') {
			cb	= options;
			options	= {};
		}

		if (options.onlyNames) {
			sql = 'SELECT DISTINCT name FROM cms_snippets ORDER BY name;';
			db.query(sql, cb);
			return;
		}

		sql	= 'SELECT * FROM cms_snippets\n';
		sql	+= 'WHERE 1 + 1\n';

		if (options.names !== undefined) {
			if (typeof options.names === 'string') {
				options.names = [options.names];
			}

			if (options.names.length === 0) {
				options.names = [''];
			}

			sql += '	AND name IN (';

			for (let i = 0; options.names[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.names[i]);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		sql += 'ORDER BY name, lang';

		db.query(sql, dbFields, function (err, rows) {
			const	snippets	= [];

			let	snippet,
				prevName;

			if (err) return cb(err);

			for (let i = 0; rows[i] !== undefined; i ++) {
				if (prevName !== rows[i].name) {
					if (snippet) {
						snippets.push(snippet);
					}

					snippet	= {'name': rows[i].name, 'langs': {}};
				}

				prevName	= rows[i].name;
				snippet.langs[rows[i].lang]	= rows[i].body;
			}

			// Add the last one
			if (snippet) {
				snippets.push(snippet);
			}

			cb(null, snippets);
		});
	});
}

function rmPage(uuid, cb) {
	const	options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'rmPage';
	message.params	= {};

	message.params.data	= {'uuid': uuid};

	dataWriter.intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});
}

function rmSnippet(name, cb) {
	const	options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'rmSnippet';
	message.params	= {};

	message.params.data	= {'name': name};

	dataWriter.intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});
}

/**
 * Save a page
 *
 * @param obj data	-	{ // All options EXCEPT name are optional!
 *			'id':	1323,
 *			'name':	'barfoo'
 *			'published':	dateObj,
 *			'template':	str, // Defaults to "default"
 *			'langs': {
 *				'en': {
 *					'htmlTitle':	'foo',
 *					'slug':	'bar',
 *					'body':	'lots of foo and bars'
 *				},
 *				'sv' ...
 *			}
 *		}
 * @param func cb(err, page) - the page will be a row from getPages()
 */
function savePage(data, cb) {
	const	options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'savePage';
	message.params	= {};

	message.params.data	= data;

	dataWriter.intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});
};

function saveSnippet(data, cb) {
	const	options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'saveSnippet';
	message.params	= {};

	message.params.data	= data;

	dataWriter.intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});
}

exports.dataWriter	= dataWriter;
exports.getPages	= getPages;
exports.getSnippets	= getSnippets;
exports.options	= dataWriter.options;
exports.rmPage	= rmPage;
exports.rmSnippet	= rmSnippet;
exports.savePage	= savePage;
exports.saveSnippet	= saveSnippet;
