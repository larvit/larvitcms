'use strict';

const uuidLib = require('uuid');
const { slugify } = require('larvitslugify');
const assert = require('assert');
const { Utils, Log } = require('larvitutils');
const Cms = require(__dirname + '/../cms.js');
const Db = require('larvitdb');
const fs = require('fs');

const lUtils = new Utils();
const log = new Log('info');

let cmsLib;
let db;

before(async () => {
	// Run DB Setup
	let confFile;

	if (process.env.TRAVIS) {
		confFile = __dirname + '/../config/db_travis.json';
	} else {
		confFile = __dirname + '/../config/db_test.json';
	}

	log.verbose('DB config file: "' + confFile + '"');

	// First look for absolute path
	let conf;
	try {
		await fs.promises.stat(confFile);
		log.verbose('DB config: ' + JSON.stringify(require(confFile)));
		conf = require(confFile);
	// eslint-disable-next-line no-unused-vars
	} catch (err) {
		// Then look for this string in the config folder
		confFile = __dirname + '/../config/' + confFile;
		await fs.promises.stat(confFile);
		log.verbose('DB config: ' + JSON.stringify(require(confFile)));
		conf = require(confFile);
	}

	db = new Db({
		...conf,
		log,
	});

	// Check for empty db
	const { rows } = await db.query('SHOW TABLES');
	if (rows.length) {
		throw new Error('Database is not empty. To make a test, you must supply an empty database!');
	}

	// Load lib
	cmsLib = new Cms({
		db,
		log,
		lUtils,
	});

	await cmsLib.runDbMigrations();
});

after(async () => {
	await db.removeAllTables();
});

describe('Sanity test', function () {
	it('Get pages of empty database', async () => {
		const pages = await cmsLib.getPages({});
		assert.deepEqual(pages, []);
	});
});

describe('Cms page CRUD test', function () {
	const cmsPage = {
		uuid: uuidLib.v1(),
		name: 'foo',
		published: true,
		template: 'default',
		langs: {
			en: {
				htmlTitle: 'foobar',
				slug: 'bar',
				body1: 'lots of foo and bars',
			},
			sv: {
				htmlTitle: 'sv_foobar',
				slug: 'sv_bar',
				body1: 'sv_lots of foo and bars',
			},
		},
	};

	const cmsPage2 = {
		uuid: uuidLib.v1(),
		name: 'foo2',
		published: false,
		template: 'default',
		langs: {
			en: {
				htmlTitle: 'foobar2',
				slug: 'bar2',
				body1: 'lots of foo and bars2',
			},
			sv: {
				htmlTitle: 'sv_foobar2',
				slug: 'sv_ba??r2',
				body1: 'sv_lots of foo and bars2',
			},
		},
	};

	it('Create 2 new pages', async () => {
		await cmsLib.savePage(cmsPage);
		await cmsLib.savePage(cmsPage2);

		const pages = await cmsLib.getPages();
		assert.strictEqual(pages.length, 2);

		assert.strictEqual(pages[0].uuid, cmsPage.uuid);
		assert.strictEqual(pages[0].name, 'foo');
		assert.strictEqual(Object.keys(pages[0].langs).length, 2);
		assert.strictEqual(pages[0].langs.en.htmlTitle, 'foobar');
		assert.strictEqual(pages[0].langs.sv.htmlTitle, 'sv_foobar');

		assert.strictEqual(pages[1].uuid, cmsPage2.uuid);
		assert.strictEqual(pages[1].name, 'foo2');
		assert.strictEqual(Object.keys(pages[1].langs).length, 2);
		assert.strictEqual(pages[1].langs.en.htmlTitle, 'foobar2');
		assert.strictEqual(pages[1].langs.sv.htmlTitle, 'sv_foobar2');
	});

	it('Get page by uuid', async () => {
		const pages = await cmsLib.getPages({uuids: cmsPage.uuid});
		const page = pages[0];

		assert.strictEqual(pages.length, 1);
		assert.strictEqual(page.uuid, cmsPage.uuid);
		assert.strictEqual(page.name, 'foo');
		assert.strictEqual(Object.keys(page.langs).length, 2);
		assert.strictEqual(page.langs.en.htmlTitle, 'foobar');
		assert.strictEqual(page.langs.sv.htmlTitle, 'sv_foobar');
	});

	it('Get pages with limit', async () => {
		const pages = await cmsLib.getPages({limit: 1});
		assert.strictEqual(pages.length, 1);
	});

	it('Get page by slug', async () => {
		const pages = await cmsLib.getPages({slugs: 'sv_bar'});
		assert.strictEqual(pages.length, 1);
		assert.strictEqual(pages[0].uuid, cmsPage.uuid);
	});

	it('Only get published pages', async () => {
		const pages = await cmsLib.getPages({published: true});
		assert.strictEqual(pages.length, 1);
		assert.strictEqual(pages[0].uuid, cmsPage.uuid);
	});

	it('Get by uuid and only one lang', async () => {
		const pages = await cmsLib.getPages({uuids: cmsPage.uuid, langs: 'en'});
		assert.strictEqual(pages.length, 1);
		assert.strictEqual(pages[0].uuid, cmsPage.uuid);
		assert.strictEqual(Object.keys(pages[0].langs).length, 1);
	});

	it('Update cms page', async () => {
		const updatePage = JSON.parse(JSON.stringify(cmsPage));

		updatePage.langs.en.body1 += ' and other stuff';

		await cmsLib.savePage(updatePage);

		const pages = await cmsLib.getPages({uuids: cmsPage.uuid});
		assert.strictEqual(pages.length, 1);
		assert.strictEqual(pages[0].langs.en.body1, 'lots of foo and bars and other stuff');
	});

	it('Remove cms page', async () => {
		await cmsLib.rmPage(cmsPage2.uuid);
		const pages = await cmsLib.getPages();
		assert.strictEqual(pages.length, 1);
		assert.strictEqual(pages[0].uuid, cmsPage.uuid);
	});
});

describe('Snippets CRUD', function () {
	const snippet1 = {
		body: 'body 1 en',
		name: slugify('body 1 en'),
		lang: 'en',
	};

	const snippet2 = {
		body: 'body 2 sv',
		name: slugify('body 2 sv'),
		lang: 'sv',
	};

	it('Create snippets', async () => {
		await cmsLib.saveSnippet(snippet1);
		await cmsLib.saveSnippet(snippet2);

		const snippets = await cmsLib.getSnippets();
		assert.strictEqual(snippets.length, 2);
	});

	it('Get snippet names', async () => {
		const snippets = await cmsLib.getSnippets({ onlyNames: true });
		assert.strictEqual(snippets.length, 2);
		assert.deepStrictEqual(snippets[0], { name: slugify('body 1 en') });
		assert.deepStrictEqual(snippets[1], { name: slugify('body 2 sv') });
	});

	it('Get snippet by name', async () => {
		const snippets = await cmsLib.getSnippets({names: slugify('body 1 en')});
		assert.strictEqual(snippets.length, 1);
		assert.strictEqual(snippets[0].langs.en, 'body 1 en');
	});

	it('Get snippet by no names should give no result', async () => {
		const snippets = await cmsLib.getSnippets({names: []});
		assert.strictEqual(snippets.length, 0);
	});

	it('Remove snippet by name', async () => {
		await cmsLib.rmSnippet(slugify('body 1 en'));
		const snippets = await cmsLib.getSnippets({names: slugify('body 1 en')});
		assert.strictEqual(snippets.length, 0);
	});
});
