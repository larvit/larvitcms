'use strict';

const	events	= require('events'),
	eventEmitter	= new events.EventEmitter(),
	DbMigration	= require('larvitdbmigration'),
	dbmigration	=  new DbMigration({'dbType': 'larvitdb', 'dbDriver': require('larvitdb'), 'tableName': 'cms_db_version', 'migrationScriptsPath': __dirname + '/dbmigration'}),
	logPrefix	= 'larvitcms: ./cms.js - ',
	slugify	= require('larvitslugify'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false;

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
	ready(function (err) {
		const	thisLogPrefix	= logPrefix + 'getPages() - ',
			tmpPages	= {},
			dbFields	= [],
			pages	= [];

		let	sql;

		if (err) return cb(err);

		if (typeof options === 'function') {
			cb	= options;
			options	= {};
		}

		log.debug(thisLogPrefix + 'Called with options: "' + JSON.stringify(options) + '"');

		// Make sure options that should be arrays actually are arrays
		// This will simplify our lives in the SQL builder below
		if (options.langs !== undefined && ! (options.langs instanceof Array)) {
			options.langs = [options.langs];
		}

		if (options.ids !== undefined && ! (options.ids instanceof Array)) {
			options.ids = [options.ids];
		}

		if (options.slugs !== undefined && ! (options.slugs instanceof Array)) {
			options.slugs = [options.slugs];
		}

		// Make sure there is an invalid ID in the id list if it is empty
		// Since the most logical thing to do is replying with an empty set
		if (options.ids instanceof Array && options.ids.length === 0) {
			options.ids.push(- 1);
		}

		if (options.limit === undefined) {
			options.limit = 10;
		}

		sql  = 'SELECT pgd.*, p.*\n';
		sql += 'FROM cms_pages p\n';
		sql += '	LEFT JOIN cms_pagesData pgd ON pgd.pageId = p.id\n';
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
			sql += '	AND p.id IN (SELECT pageId FROM cms_pagesData WHERE slug IN (';

			for (let i = 0; options.slugs[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.slugs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + '))\n';
		}

		// Only get posts with given ids
		if (options.ids !== undefined) {
			sql += '	AND p.id IN (';

			for (let i = 0; options.ids[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.ids[i]);
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

		ready(function (err) {
			if (err) return cb(err);

			db.query(sql, dbFields, function (err, rows) {
				let	pageId;

				if (err) return cb(err);

				for (let i = 0; rows[i] !== undefined; i ++) {
					if (tmpPages[rows[i].id] === undefined) {
						tmpPages[rows[i].id] = {
							'id':	rows[i].id,
							'name':	rows[i].name,
							'published':	Boolean(rows[i].published),
							'langs':	{}
						};
					}

					tmpPages[rows[i].id].langs[rows[i].lang] = {
						'htmlTitle':	rows[i].htmlTitle,
						'body1':	rows[i].body1,
						'body2':	rows[i].body2,
						'body3':	rows[i].body3,
						'body4':	rows[i].body4,
						'body5':	rows[i].body5,
						'slug':	rows[i].slug
					};
				}

				for (pageId in tmpPages) {
					pages.push(tmpPages[pageId]);
				}

				cb(null, pages);
			});
		});
	});
};

/**
 * Get snippets
 *
 * @param obj options - slugs....
 * @param func cb(err, slugs)
 */
function getSnippets(options, cb) {
	ready(function (err) {
		const	thisLogPrefix	= logPrefix + 'getSnippets() - ',
			dbFields = [];

		let	sql;

		if (err) return cb(err);

		if (typeof options === 'function') {
			cb	= options;
			options	= {};
		}

		if (options.onlySlugs) {
			sql = 'SELECT DISTINCT slug FROM cms_snippets ORDER BY slug;';
			db.query(sql, cb);
			return;
		}

		sql	= 'SELECT * FROM cms_snippets\n';
		sql	+= 'WHERE 1 + 1\n';

		if (options.slugs !== undefined) {
			if (typeof options.slugs === 'string') {
				options.slugs = [options.slugs];
			}

			if (options.slugs.length === 0) {
				options.slugs = [''];
			}

			sql += '	AND slug IN (';

			for (let i = 0; options.slugs[i] !== undefined; i ++) {
				sql += '?,';
				dbFields.push(options.slugs[i]);
			}

			sql = sql.substring(0, sql.length - 1) + ')\n';
		}

		sql += 'ORDER BY slug, lang';

		ready(function (err) {
			if (err) return cb(err);

			db.query(sql, dbFields, function (err, rows) {
				const snippets = [];

				let	snippet,
					prevSlug;

				if (err) return cb(err);

				for (let i = 0; rows[i] !== undefined; i ++) {
					if (prevSlug !== rows[i].slug) {
						if (snippet) {
							snippets.push(snippet);
						}

						snippet = {'slug': rows[i].slug, 'langs': {}};
					}

					prevSlug = rows[i].slug;

					snippet.langs[rows[i].lang] = rows[i].body;
				}

				// Add the last one
				if (snippet) {
					snippets.push(snippet);
				}

				cb(null, snippets);
			});
		});
	});
}

function ready(retries, cb) {
	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
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

	dbmigration.run(function (err) {
		if (err) {
			log.error('larvitorder: dataWriter.js - ready() - Database error: ' + err.message);
			return;
		}

		isReady	= true;
		eventEmitter.emit('ready');

		cb(err);
	});
}
ready();

function rmPage(id, cb) {
	ready(function (err) {
		if (err) return cb(err);

		db.query('DELETE FROM cms_pagesData WHERE pageId = ?', [id], function (err) {
			if (err) return cb(err);

			db.query('DELETE FROM cms_pages WHERE id = ?', [id], cb);
		});
	});
}

/**
 * Save a page
 *
 * @param obj data	-	{ // All options EXCEPT name are optional!
 *			'id':	1323,
 *			'name':	'barfoo'
 *			'published':	dateObj,
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
	ready(function (err) {
		const	thisLogPrefix	= logPrefix + 'savePage() - ',
			tasks	= [];

		let	lang;

		if (err) return cb(err);

		if (typeof data === 'function') {
			cb	= data;
			data	= {};
		}

		log.verbose(thisLogPrefix + 'Running with data. "' + JSON.stringify(data) + '"');

		tasks.push(ready);

		// Create a new page if id is not set
		if (data.id === undefined) {
			if ( ! data.name) {
				// Add a task to break the async flow
				tasks.push(function (cb) {
					const	err	= new Error('data.name is missing!');
					log.warn(thisLogPrefix + err.message);
					cb(err);
				});
			}

			tasks.push(function (cb) {
				const	dbFields	= [data.name];

				let	sql	= 'INSERT INTO cms_pages (name';

				if (data.published) {
					sql += ', published';
				}

				sql += ') VALUES(?';

				if (data.published) {
					sql += ',?';
					dbFields.push(data.published);
				}

				sql += ');';

				db.query(sql, dbFields, function (err, result) {
					if (err) return cb(err);

					log.debug(thisLogPrefix + 'New page created with id: "' + result.insertId + '"');
					data.id = result.insertId;
					cb();
				});
			});
		} else {
			// Erase previous data
			tasks.push(function (cb) {
				db.query('DELETE FROM cms_pagesData WHERE pageId = ?', [parseInt(data.id)], cb);
			});

			// Set published
			if (data.published !== undefined) {
				tasks.push(function (cb) {
					const	dbFields	= [data.published, data.id],
						sql	= 'UPDATE cms_pages SET published = ? WHERE id = ?';

					db.query(sql, dbFields, cb);
				});
			}

			// Set name
			if (data.name !== undefined) {
				tasks.push(function (cb) {
					const	dbFields	= [data.name, data.id],
						sql	= 'UPDATE cms_pages SET name = ? WHERE id = ?';

					db.query(sql, dbFields, cb);
				});
			}
		}

		// We need to declare this outside the loop because of async operations
		function addEntryData(lang, htmlTitle, body1, body2, body3, body4, body5, slug) {
			tasks.push(function (cb) {
				const	dbFields	= [data.id, lang, htmlTitle, body1, body2, body3, body4, body5, slug],
					sql	= 'INSERT INTO cms_pagesData (pageId, lang, htmlTitle, body1, body2, body3, body4, body5, slug) VALUES(?,?,?,?,?,?,?,?,?);';

				db.query(sql, dbFields, cb);
			});
		}

		// Add content data
		if (data.langs) {
			for (lang in data.langs) {
				if (data.langs[lang].slug) {
					data.langs[lang].slug = slugify(data.langs[lang].slug, {'save': '/'});
				}

				if ( ! data.langs[lang].slug) {
					data.langs[lang].slug = slugify(data.langs[lang].htmlTitle);
				}

				if ( ! data.langs[lang].htmlTitle)	data.langs[lang].htmlTitle	= '';
				if ( ! data.langs[lang].body1)	data.langs[lang].body1	= '';
				if ( ! data.langs[lang].body2)	data.langs[lang].body2	= '';
				if ( ! data.langs[lang].body3)	data.langs[lang].body3	= '';
				if ( ! data.langs[lang].body4)	data.langs[lang].body4	= '';
				if ( ! data.langs[lang].body5)	data.langs[lang].body5	= '';

				addEntryData(lang, data.langs[lang].htmlTitle, data.langs[lang].body1, data.langs[lang].body2, data.langs[lang].body3, data.langs[lang].body4, data.langs[lang].body5, data.langs[lang].slug);
			}
		}

		async.series(tasks, function (err) {
			if (err) return cb(err);

			// Re-read this entry from the database to be sure to get the right deal!
			getPages({'ids': data.id}, function (err, pages) {
				if (err) return cb(err);

				cb(null, pages[0]);
			});
		});
	});
};

function saveSnippet(options, cb) {
	ready(function (err) {
		const	dbFields	= [options.body, options.slug, options.lang],
			sql	= 'REPLACE INTO cms_snippets (body, slug, lang) VALUES(?,?,?);';

		if (err) return cb(err);

		db.query(sql, dbFields, cb);
	});
}

exports.getPages	= getPages;
exports.getSnippets	= getSnippets;
exports.ready	= ready;
exports.rmPage	= rmPage;
exports.savePage	= savePage;
exports.saveSnippet	= saveSnippet;
