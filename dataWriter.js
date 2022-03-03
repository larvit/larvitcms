'use strict';

const { DbMigration } = require('larvitdbmigration');
const { slugify } = require('larvitslugify');
const { Utils, Log } = require('larvitutils');

const topLogPrefix = 'larvitcms: dataWriter.js: ';

class DataWriter {
	constructor(options) {
		if (!options.log) {
			options.log = new Log();
		}

		this.options = options;

		for (const key of Object.keys(options)) {
			this[key] = options[key];
		}

		this.lUtils = new Utils({log: this.log});
	}

	async runDbMigrations() {
		const options = {};

		options.dbType = 'mariadb';
		options.dbDriver = this.db;
		options.tableName = 'cms_db_version';
		options.migrationScriptsPath = __dirname + '/dbmigration';
		const dbMigration = new DbMigration(options);

		await dbMigration.run();
	}

	async rmPage(uuid) {
		const logPrefix = topLogPrefix + 'rmPage() - ';
		const uuidBuffer = this.lUtils.uuidToBuffer(uuid);

		if (uuid === undefined) {
			const err = new Error('pageUuid not provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		if (uuidBuffer === false) {
			const err = new Error('Inavlid pageUuid provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		await this.db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [uuidBuffer]);
		await this.db.query('DELETE FROM cms_pages WHERE uuid = ?', [uuidBuffer]);
	}

	async rmSnippet(name) {
		const logPrefix = topLogPrefix + 'rmSnippet() - ';

		if (!name) {
			const err = new Error('snippet name not provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		await this.db.query('DELETE FROM cms_snippets WHERE name = ?', [name]);
	}

	async savePage(options) {
		const logPrefix = topLogPrefix + 'savePage() - ';
		const uuidBuffer = this.lUtils.uuidToBuffer(options.uuid);

		if (options.uuid === undefined) {
			const err = new Error('pageUuid not provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		if (uuidBuffer === false) {
			const err = new Error('Inavlid pageUuid provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		this.log.debug(logPrefix + 'Running with data. "' + JSON.stringify(options) + '"');

		await this.db.query('DELETE FROM cms_pagesData WHERE pageUuid = ?', [uuidBuffer]);
		await this.db.query('DELETE FROM cms_pages WHERE uuid = ?', [uuidBuffer]);

		// Insert page
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

		await this.db.query(sql, dbFields);

		// We need to declare this outside the loop because of async operations
		const addEntryData = async (lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug) => {
			const dbFields = [uuidBuffer, lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug];
			const sql = 'INSERT INTO cms_pagesData (pageUuid, lang, htmlTitle, body1, body2, body3, body4, body5, body6, slug) VALUES(?,?,?,?,?,?,?,?,?,?);';
			await this.db.query(sql, dbFields);
		};

		// Add content data
		if (options.langs) {
			for (const lang in options.langs) {
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

				await addEntryData(lang, options.langs[lang].htmlTitle, options.langs[lang].body1, options.langs[lang].body2, options.langs[lang].body3, options.langs[lang].body4, options.langs[lang].body5, options.langs[lang].body6, options.langs[lang].slug);
			}
		}
	}

	async saveSnippet(options) {
		const logPrefix = topLogPrefix + 'saveSnippet() - ';
		const sql = 'REPLACE INTO cms_snippets (body, name, lang) VALUES(?,?,?);';
		const dbFields = [options.body, options.name, options.lang];

		if (options.name === undefined) {
			const err = new Error('Name not provided');
			this.log.warn(logPrefix + err.message);
			throw err;
		}

		await this.db.query(sql, dbFields);
	}
}

module.exports = exports = DataWriter;
