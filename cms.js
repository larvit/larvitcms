/* eslint-disable no-tabs */
'use strict';

const DataWriter = require(__dirname + '/dataWriter.js');
const { Utils, Log } = require('larvitutils');

const topLogPrefix = 'larvitcms: ./cms.js: ';

class Cms {
	constructor(options) {
		this.options = options || {};

		if (!options.db) throw new Error('Missing required option "db"');

		if (!options.lUtils) options.lUtils = new Utils();

		if (!this.options.log) {
			this.options.log = new Log();
		}

		this.log = this.options.log;

		for (const key of Object.keys(this.options)) {
			this[key] = this.options[key];
		}

		this.dataWriter = new DataWriter({
			log: this.log,
			db: this.db,
		});
	};

	async runDbMigrations() {
		await this.dataWriter.runDbMigrations();
	}

	async getPages(options) {
		const logPrefix = topLogPrefix + 'getPages() - ';
		const tmpPages = {};
		const dbFields = [];
		const pages = [];

		let sql;

		options = options || {};

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
					throw e;
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

		const { rows } = await this.db.query(sql, dbFields);
		for (let i = 0; rows[i] !== undefined; i++) {
			const uuid = this.lUtils.formatUuid(rows[i].uuid);

			if (tmpPages[uuid] === undefined) {
				tmpPages[uuid] = {
					uuid: uuid,
					name: rows[i].name,
					published: Boolean(rows[i].published),
					template: rows[i].template,
					langs: {},
				};
			}

			tmpPages[uuid].langs[rows[i].lang] = {
				htmlTitle: rows[i].htmlTitle,
				body1: rows[i].body1,
				body2: rows[i].body2,
				body3: rows[i].body3,
				body4: rows[i].body4,
				body5: rows[i].body5,
				slug: rows[i].slug,
			};
		}

		for (const pageUuid in tmpPages) {
			pages.push(tmpPages[pageUuid]);
		}

		return pages;
	};

	async getSnippets(options) {
		options = options || {};

		if (options.onlyNames) {
			const { rows } = await this.db.query('SELECT DISTINCT name FROM cms_snippets ORDER BY name;');
			return rows;
		}

		const dbFields = [];
		let sql = 'SELECT * FROM cms_snippets\n';
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

		const { rows } = await this.db.query(sql, dbFields);
		const snippets = [];

		let snippet;
		let prevName;

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

		return snippets;
	}

	async rmPage(uuid) {
		await this.dataWriter.rmPage(uuid);
	}

	async rmSnippet(name) {
		await this.dataWriter.rmSnippet(name);
	}

	async savePage(data) {
		await this.dataWriter.savePage(data);
	};

	async saveSnippet(data) {
		await this.dataWriter.saveSnippet(data);
	}
}

module.exports = exports = Cms;
