'use strict';

var db           = require('larvitdb'),
    log          = require('winston'),
    async        = require('async'),
    events       = require('events'),
    slugify      = require('larvitslugify'),
    eventEmitter = new events.EventEmitter(),
    dbChecked    = false;

// Create database tables if they are missing
function createTablesIfNotExists(cb) {
	var sql;

	sql = 'CREATE TABLE IF NOT EXISTS `cms_pages` (`id` int(10) unsigned NOT NULL AUTO_INCREMENT, `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL, `published` tinyint(3) unsigned NOT NULL DEFAULT \'0\', PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;';
	db.query(sql, function(err) {
		if (err) {
			cb(err);
			return;
		}

		sql = 'CREATE TABLE IF NOT EXISTS `cms_pagesData` (`pageId` int(10) unsigned NOT NULL, `lang` char(2) CHARACTER SET ascii NOT NULL, `htmlTitle` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL, `slug` varchar(100) CHARACTER SET ascii NOT NULL, `body` text COLLATE utf8mb4_unicode_ci NOT NULL, PRIMARY KEY (`pageId`,`lang`), CONSTRAINT `cms_pagesData_ibfk_1` FOREIGN KEY (`pageId`) REFERENCES `cms_pages` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;';

		db.query(sql, function(err) {
			if (err) {
				cb(err);
				return;
			}

			dbChecked = true;
			eventEmitter.emit('checked');
		});
	});
}
createTablesIfNotExists(function(err) {
	log.error('larvitcms: createTablesIfNotExists() - Database error: ' + err.message);
});

/**
 * Get pages
 *
 * @param obj options - { // All options are optional!
 *                        'langs': ['sv', 'en'],
 *                        'slugs': ['blu', 'bla'],
 *                        'ids': [32,4],
 *                        'published': true, // Or false, to get both, set to undefined
 *                        'limit': 10, // Defaults to 10, explicitly give false to remove limit
 *                        'offset': 20
 *                      }
 * @param func cb - callback(err, pages)
 */
function getPages(options, cb) {
	var tmpPages = {},
	    dbFields = [],
	    pages    = [],
	    sql,
	    i;

	if (typeof options === 'function') {
		cb      = options;
		options = {};
	}

	log.debug('larvitcms: getPages() - Called with options: "' + JSON.stringify(options) + '"');

	// Make sure options that should be arrays actually are arrays
	// This will simplify our lives in the SQL builder below
	if (options.langs !== undefined && ! (options.langs instanceof Array))
		options.langs = [options.langs];

	if (options.ids !== undefined && ! (options.ids instanceof Array))
		options.ids = [options.ids];

	if (options.slugs !== undefined && ! (options.slugs instanceof Array))
		options.slugs = [options.slugs];

	// Make sure there is an invalid ID in the id list if it is empty
	// Since the most logical thing to do is replying with an empty set
	if (options.ids instanceof Array && options.ids.length === 0)
		options.ids.push(- 1);

	if (options.limit === undefined)
		options.limit = 10;

	// Make sure the database tables exists before going further!
	if ( ! dbChecked) {
		log.debug('larvitcms: getPages() - Database not checked, rerunning this method when event have been emitted.');
		eventEmitter.on('checked', function() {
			log.debug('larvitcms: getPages() - Database check event received, rerunning getPages().');
			getPages(options, cb);
		});

		return;
	}

	sql  = 'SELECT pgd.*, p.*\n';
	sql += 'FROM cms_pages p\n';
	sql += '	LEFT JOIN cms_pagesData pgd ON pgd.pageId = p.id\n';
	sql += 'WHERE 1 + 1\n';

	// Only get post contents with selected languages
	if (options.langs !== undefined) {
		sql += '	AND pgd.lang IN (';

		i = 0;
		while (options.langs[i] !== undefined) {
			sql += '?,';
			dbFields.push(options.langs[i]);

			i ++;
		}

		sql = sql.substring(0, sql.length - 1) + ')\n';
	}

	// Only get posts with the current slugs
	if (options.slugs !== undefined) {
		sql += '	AND p.id IN (SELECT pageId FROM cms_pagesData WHERE slug IN (';

		i = 0;
		while (options.slugs[i] !== undefined) {
			sql += '?,';
			dbFields.push(options.slugs[i]);

			i ++;
		}

		sql = sql.substring(0, sql.length - 1) + '))\n';
	}

	// Only get posts with given ids
	if (options.ids !== undefined) {
		sql += '	AND p.id IN (';

		i = 0;
		while (options.ids[i] !== undefined) {
			sql += '?,';
			dbFields.push(options.ids[i]);

			i ++;
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

		if (options.offset !== undefined)
			sql += ' OFFSET ' + parseInt(options.offset);
	}

	db.query(sql, dbFields, function(err, rows) {
		var pageId,
		    i;

		if (err) {
			cb(err);
			return;
		}

		i = 0;
		while (rows[i] !== undefined) {
			if (tmpPages[rows[i].id] === undefined) {
				tmpPages[rows[i].id] = {
					'id':        rows[i].id,
					'name':      rows[i].name,
					'published': Boolean(rows[i].published),
					'langs':     {}
				};
			}

			tmpPages[rows[i].id].langs[rows[i].lang] = {
				'htmlTitle': rows[i].htmlTitle,
				'body':      rows[i].body,
				'slug':      rows[i].slug
			};

			i ++;
		}

		for (pageId in tmpPages) {
			pages.push(tmpPages[pageId]);
		}

		cb(null, pages);
	});
};

function rmPage(id, cb) {
	db.query('DELETE FROM cms_pagesData WHERE pageId = ?', [id], function(err) {
		if (err) {
			cb(err);
			return;
		}

		db.query('DELETE FROM cms_pages WHERE id = ?', [id], cb);
	});
}

/**
 * Save a page
 *
 * @param obj data - { // All options EXCEPT name are optional!
 *                     'id': 1323,
 *                     'name': 'barfoo'
 *                     'published': dateObj,
 *                     'langs': {
 *                       'en': {
 *                         'htmlTitle': 'foo',
 *                         'slug':      'bar',
 *                         'body':      'lots of foo and bars'
 *                       },
 *                       'sv' ...
 *                     }
 *                   }
 * @param func cb(err, page) - the page will be a row from getPages()
 */
function savePage(data, cb) {
	var tasks = [],
	    lang;

	if (typeof data === 'function') {
		cb   = data;
		data = {};
	}

	log.verbose('larvitcms: savePage() - Running with data. "' + JSON.stringify(data) + '"');

	// Make sure the database tables exists before going further!
	if ( ! dbChecked) {
		log.debug('larvitcms: savePage() - Database not checked, rerunning this method when event have been emitted.');
		eventEmitter.on('checked', function() {
			log.debug('larvitcms: savePage() - Database check event received, rerunning savePage().');
			exports.savePage(data, cb);
		});

		return;
	}

	// Create a new page if id is not set
	if (data.id === undefined) {
		if ( ! data.name) {
			// Add a task to break the async flow
			tasks.push(function(cb) {
				var err = new Error('larvitcms: savePage() - data.name is missing!');
				log.warn(err.message);
				cb(err);
			});
		}

		tasks.push(function(cb) {
			var sql      = 'INSERT INTO cms_pages (name',
				  dbFields = [data.name];

			if (data.published)
				sql += ', published';

			sql += ') VALUES(?';

			if (data.published) {
				sql += ',?';
				dbFields.push(data.published);
			}

			sql += ');';

			db.query(sql, dbFields, function(err, result) {
				if (err) {
					cb(err);
					return;
				}

				log.debug('larvitcms: savePage() - New page created with id: "' + result.insertId + '"');
				data.id = result.insertId;
				cb();
			});
		});
	} else {
		// Erase previous data
		tasks.push(function(cb) {
			db.query('DELETE FROM cms_pagesData WHERE pageId = ?', [parseInt(data.id)], cb);
		});

		// Set published
		if (data.published !== undefined) {
			tasks.push(function(cb) {
				var sql      = 'UPDATE cms_pages SET published = ? WHERE id = ?',
				    dbFields = [data.published, data.id];

				db.query(sql, dbFields, cb);
			});
		}

		// Set name
		if (data.name !== undefined) {
			tasks.push(function(cb) {
				var sql      = 'UPDATE cms_pages SET name = ? WHERE id = ?',
				    dbFields = [data.name, data.id];

				db.query(sql, dbFields, cb);
			});
		}
	}

	// We need to declare this outside the loop because of async operations
	function addEntryData(lang, htmlTitle, body, slug) {
		tasks.push(function(cb) {
			var sql      = 'INSERT INTO cms_pagesData (pageId, lang, htmlTitle, body, slug) VALUES(?,?,?,?,?);',
			    dbFields = [data.id, lang, htmlTitle, body, slug];

			db.query(sql, dbFields, cb);
		});
	}

	// Add content data
	if (data.langs) {
		for (lang in data.langs) {
			if (data.langs[lang].slug)
				data.langs[lang].slug = slugify(data.langs[lang].slug, {'save': '/'});

			if (data.langs[lang].htmlTitle || data.langs[lang].body)
				addEntryData(lang, data.langs[lang].htmlTitle, data.langs[lang].body, data.langs[lang].slug);
		}
	}

	async.series(tasks, function(err) {
		if (err) {
			cb(err);
			return;
		}

		// Re-read this entry from the database to be sure to get the right deal!
		getPages({'ids': data.id}, function(err, pages) {
			if (err) {
				cb(err);
				return;
			}

			cb(null, pages[0]);
		});
	});
};

exports.getPages = getPages;
exports.rmPage   = rmPage;
exports.savePage = savePage;