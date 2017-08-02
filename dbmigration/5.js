'use strict';

const	uuidLib	= require('uuid'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	db	= require('larvitdb');

exports = module.exports = function (cb) {
	const tasks = [];

	db.query('SELECT id FROM cms_pages WHERE uuid IS NULL', function (err, rows) {
		if (err) return cb(err);

		if (rows.length === 0) return cb();

		for (const r of rows) {
			const uuid = lUtils.uuidToBuffer(uuidLib.v1());

			tasks.push(function (cb) {
				db.query('UPDATE cms_pages SET uuid = ? WHERE id = ?', [uuid, r.id], cb);
			});

			tasks.push(function (cb) {
				db.query('UPDATE cms_pagesData SET pageUuid = ? WHERE pageId = ?', [uuid, r.id], cb);
			});
		}

		async.series(tasks, cb);
	});
};