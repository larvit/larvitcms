'use strict';

const async = require('async');
const uuid = require('uuid');
const _ = require('lodash');

exports.run = function (req, res, cb) {
	const data = {global: res.globalData};
	const tasks = [];
	const pageUuid = res.globalData.urlParsed.query.uuid || uuid.v1();

	data.global.menuControllerName = 'adminCmsPages';
	data.cmsTemplates = require(req.lfs.getPathSync('config/cmsTemplates.json'));

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null, req, res, null);
	}

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {
		// Basic form validation
		tasks.push(function (cb) {
			if (!res.globalData.formFields.name) {
				res.globalData.errors = ['Page name is required'];

				return cb(new Error('Invalid fields'));
			}

			cb();
		});

		// Save the data
		tasks.push(function (cb) {
			const saveObj = {};

			saveObj.uuid = pageUuid;
			saveObj.name = res.globalData.formFields.name;
			saveObj.template = res.globalData.formFields.template;
			saveObj.langs = {};

			let fieldName;
			let field;
			let lang;

			if (res.globalData.formFields.published) {
				saveObj.published = true;
			} else {
				saveObj.published = false;
			}

			for (field in res.globalData.formFields) {
				if (field.split('.').length === 2) {
					fieldName = field.split('.')[0];
					lang = field.split('.')[1];

					if (saveObj.langs[lang] === undefined) {
						saveObj.langs[lang] = {};
					}

					if (!res.globalData.formFields[field]) {
						saveObj.langs[lang][fieldName] = null;
					} else {
						if (fieldName === 'slug') {
							res.globalData.formFields[field] = _.trimEnd(res.globalData.formFields[field], '/');
						}

						saveObj.langs[lang][fieldName] = res.globalData.formFields[field];
					}
				}
			}

			req.cms.savePage(saveObj, function (err) {
				if (err) return cb(err);

				if (res.globalData.urlParsed.query.uuid === undefined) {
					req.session.data.nextCallData = {global: {messages: ['New page created with uuid ' + pageUuid]}};
				} else {
					req.session.data.nextCallData = {global: {messages: ['Saved']}};
				}

				res.statusCode = 302;
				res.setHeader('Location', '/adminCmsPageEdit?uuid=' + pageUuid + '&langs=' + res.globalData.urlParsed.query.langs);

				cb();
			});
		});
	}

	// Delete a page
	if (res.globalData.formFields.delete !== undefined && res.globalData.urlParsed.query.uuid !== undefined) {
		tasks.push(function (cb) {
			req.cms.rmPage(uuid, function (err) {
				if (err) return cb(err);

				req.session.data.nextCallData = {global: {messages: ['Page with Uuid ' + uuid + ' deleted']}};
				res.statusCode = 302;
				res.setHeader('Location', '/adminCmsPages');
				cb();
			});
		});

	// Load data from database
	} else if (res.globalData.urlParsed.query.uuid !== undefined) {
		tasks.push(function (cb) {
			req.cms.getPages({uuids: pageUuid}, function (err, rows) {
				let lang;

				if (rows[0] !== undefined) {
					res.globalData.formFields = {
						name: rows[0].name,
						published: rows[0].published,
						template: rows[0].template
					};

					for (lang in rows[0].langs) {
						res.globalData.formFields['htmlTitle.' + lang] = rows[0].langs[lang].htmlTitle;
						res.globalData.formFields['slug.' + lang] = rows[0].langs[lang].slug;
						res.globalData.formFields['body1.' + lang] = rows[0].langs[lang].body1;
						res.globalData.formFields['body2.' + lang] = rows[0].langs[lang].body2;
						res.globalData.formFields['body3.' + lang] = rows[0].langs[lang].body3;
						res.globalData.formFields['body4.' + lang] = rows[0].langs[lang].body4;
						res.globalData.formFields['body5.' + lang] = rows[0].langs[lang].body5;
						res.globalData.formFields['body6.' + lang] = rows[0].langs[lang].body6;
					}
				} else {
					return cb(new Error('larvitcms: controllers/adminCmsPageEdit.js - Wrong pageId supplied'));
				}

				cb();
			});
		});
	}

	async.series(tasks, function () {
		cb(null, req, res, data);
	});
};
