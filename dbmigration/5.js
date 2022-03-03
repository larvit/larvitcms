'use strict';

const uuidLib = require('uuid');
const { Utils } = require('larvitutils');

exports = module.exports = async context => {
	const { db } = context;

	const { rows } = await db.query('SELECT id FROM cms_pages WHERE uuid IS NULL');
	if (rows.length === 0) return;

	const lUtils = new Utils();

	for (const r of rows) {
		const uuid = lUtils.uuidToBuffer(uuidLib.v1());

		await db.query('UPDATE cms_pages SET uuid = ? WHERE id = ?', [uuid, r.id]);
		await db.query('UPDATE cms_pagesData SET pageUuid = ? WHERE pageId = ?', [uuid, r.id]);
	}
};
