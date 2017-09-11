'use strict';

const	Intercom	= require('larvitamintercom'),
	uuidLib	= require('uuid'),
	slugify	= require('larvitslugify'),
	assert	= require('assert'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	cms	= require(__dirname + '/../cms.js'),
	log	= require('winston'),
	db	= require('larvitdb'),
	fs	= require('fs'),
	_	= require('lodash');

cms.dataWriter	= require(__dirname + '/../dataWriter.js');
cms.dataWriter.mode	= 'master';

// Set up winston
log.remove(log.transports.Console);
/**/log.add(log.transports.Console, {
	'level':	'warn',
	'colorize':	true,
	'timestamp':	true,
	'json':	false
});/**/

before(function (done) {
	const	tasks	= [];

	this.timeout(10000);

	// Run DB Setup
	tasks.push(function (cb) {
		let	confFile;

		if (process.env.DBCONFFILE === undefined) {
			confFile	= __dirname + '/../config/db_test.json';
		} else {
			confFile	= process.env.DBCONFFILE;
		}

		log.verbose('DB config file: "' + confFile + '"');

		// First look for absolute path
		fs.stat(confFile, function (err) {
			if (err) {

				// Then look for this string in the config folder
				confFile = __dirname + '/../config/' + confFile;
				fs.stat(confFile, function (err) {
					if (err) throw err;
					log.verbose('DB config: ' + JSON.stringify(require(confFile)));
					db.setup(require(confFile), cb);
				});

				return;
			}

			log.verbose('DB config: ' + JSON.stringify(require(confFile)));
			db.setup(require(confFile), cb);
		});
	});

	// Check for empty db
	tasks.push(function (cb) {
		db.query('SHOW TABLES', function (err, rows) {
			if (err) throw err;

			if (rows.length) {
				throw new Error('Database is not empty. To make a test, you must supply an empty database!');
			}

			cb();
		});
	});

	// Setup intercom
	tasks.push(function (cb) {
		lUtils.instances.intercom = new Intercom('loopback interface');
		lUtils.instances.intercom.on('ready', cb);
	});

	tasks.push(function (cb) {
		cms.dataWriter.ready(cb);
	});

	async.series(tasks, function (err) {
		done(err);
	});
});

after(function (done) {
	db.removeAllTables(done);
});

describe('Sanity test', function () {
	it('Get pages of empty database', function (done) {
		cms.getPages({}, function (err, pages) {
			assert.strictEqual(err, null);
			assert.deepEqual(pages, []);
			done();
		});
	});
});

describe('Cms page CRUD test', function () {
	const	cmsPage = {
			'uuid': uuidLib.v1(),
			'name': 'foo',
			'published': true,
			'template': 'default',
			'langs': {
				'en': {
					'htmlTitle':	'foobar',
					'slug':	'bar',
					'body1':	'lots of foo and bars'
				},
				'sv': {
					'htmlTitle':	'sv_foobar',
					'slug':	'sv_bar',
					'body1':	'sv_lots of foo and bars'
				}
			}
		},
		cmsPage2 = {
			'uuid': uuidLib.v1(),
			'name': 'foo2',
			'published': false,
			'template': 'default',
			'langs': {
				'en': {
					'htmlTitle':	'foobar2',
					'slug':	'bar2',
					'body1':	'lots of foo and bars2'
				},
				'sv': {
					'htmlTitle':	'sv_foobar2',
					'slug':	'sv_ba??r2',
					'body1':	'sv_lots of foo and bars2'
				}
			}
		};

	it('Create 2 new pages', function (done) {
		const	tasks	= [];

		tasks.push(function (cb) {
			cms.savePage(cmsPage, cb);
		});

		tasks.push(function (cb) {
			cms.savePage(cmsPage2, cb);
		});

		tasks.push(function (cb) {
			cms.getPages(function (err, pages) {
				assert.strictEqual(pages.length, 2);
				assert.strictEqual(err, null);

				assert.strictEqual(pages[0].uuid,	cmsPage.uuid);
				assert.strictEqual(pages[0].name,	'foo');
				assert.strictEqual(Object.keys(pages[0].langs).length,	2);
				assert.strictEqual(pages[0].langs.en.htmlTitle,	'foobar');
				assert.strictEqual(pages[0].langs.sv.htmlTitle,	'sv_foobar');

				assert.strictEqual(pages[1].uuid,	cmsPage2.uuid);
				assert.strictEqual(pages[1].name,	'foo2');
				assert.strictEqual(Object.keys(pages[1].langs).length,	2);
				assert.strictEqual(pages[1].langs.en.htmlTitle,	'foobar2');
				assert.strictEqual(pages[1].langs.sv.htmlTitle,	'sv_foobar2');

				cb();
			});
		});

		async.series(tasks, done);
	});

	it('Get page by uuid', function (cb) {
		cms.getPages({'uuids': cmsPage.uuid}, function (err, pages) {
			const page = pages[0];

			assert.strictEqual(pages.length,	1);
			assert.strictEqual(err,	null);
			assert.strictEqual(page.uuid,	cmsPage.uuid);
			assert.strictEqual(page.name,	'foo');
			assert.strictEqual(Object.keys(page.langs).length,	2);
			assert.strictEqual(page.langs.en.htmlTitle,	'foobar');
			assert.strictEqual(page.langs.sv.htmlTitle,	'sv_foobar');
			cb();
		});
	});

	it('Get pages with limit', function (cb) {
		cms.getPages({'limit': 1}, function (err, pages) {
			assert.strictEqual(err,	null);
			assert.strictEqual(pages.length,	1);
			cb();
		});
	});

	it('Get page by slug', function (cb) {
		cms.getPages({'slugs': 'sv_bar'}, function (err, pages) {
			assert.strictEqual(err,	null);
			assert.strictEqual(pages.length,	1);
			assert.strictEqual(pages[0].uuid,	cmsPage.uuid);
			cb();
		});
	});

	it('Only get published pages', function (cb) {
		cms.getPages({'published': true}, function (err, pages) {
			assert.strictEqual(err,	null);
			assert.strictEqual(pages.length,	1);
			assert.strictEqual(pages[0].uuid,	cmsPage.uuid);
			cb();
		});
	});

	it('Get by uuid and only one lang', function (cb) {
		cms.getPages({'uuids': cmsPage.uuid, 'langs': 'en'}, function (err, pages) {
			assert.strictEqual(err,	null);
			assert.strictEqual(pages.length,	1);
			assert.strictEqual(pages[0].uuid,	cmsPage.uuid);
			assert.strictEqual(Object.keys(pages[0].langs).length,	1);
			cb();
		});
	});

	it('Update cms page', function (cb) {
		const	updatePage	= _.cloneDeep(cmsPage),
			tasks	= [];

		updatePage.langs.en.body1	+= ' and other stuff';

		tasks.push(function (cb) {
			cms.savePage(updatePage, cb);
		});

		tasks.push(function (cb) {
			cms.getPages({'uuids': cmsPage.uuid}, function (err, pages) {
				assert.strictEqual(err,	null);
				assert.strictEqual(pages.length,	1);
				assert.strictEqual(pages[0].langs.en.body1,	'lots of foo and bars and other stuff');
				cb();
			});
		});

		async.series(tasks, cb);
	});

	it('Remove cms page', function (cb) {
		const	tasks	= [];

		tasks.push(function (cb) {
			cms.rmPage(cmsPage2.uuid, cb);
		});

		tasks.push(function (cb) {
			cms.getPages(function (err, pages) {
				assert.strictEqual(err,	null);
				assert.strictEqual(pages.length,	1);
				assert.strictEqual(pages[0].uuid,	cmsPage.uuid);
				cb();
			});
		});

		async.series(tasks, cb);
	});
});

describe('Snippets CRUD', function () {
	const	snippet1	= {
			'body':	'body 1 en',
			'slug':	slugify('body 1 en'),
			'lang':	'en'
		},
		snippet2	= {
			'body': 'body 2 sv',
			'slug': slugify('body 2 sv'),
			'lang': 'sv'
		};

	it('Create snippets', function (cb) {
		const	tasks	= [];

		tasks.push(function (cb) {
			cms.saveSnippet(snippet1, cb);
		});

		tasks.push(function (cb) {
			cms.saveSnippet(snippet2, cb);
		});

		tasks.push(function (cb) {
			cms.getSnippets(function (err, snippets) {
				assert.strictEqual(err,	null);
				assert.strictEqual(snippets.length,	2);
				cb();
			});
		});

		async.series(tasks, cb);
	});

	it('Get snippet by slug', function (cb) {
		cms.getSnippets({'slugs': slugify('body 1 en')}, function (err, snippets) {
			assert.strictEqual(err,	null);
			assert.strictEqual(snippets.length,	1);
			assert.strictEqual(snippets[0].langs.en,	'body 1 en');
			cb();
		});
	});
});
