'use strict';

const	async	= require('async'),
	cms	= require('larvitcms'),
	_	= require('lodash');

exports.run = function (req, res, cb) {
	const	pageId	= res.globalData.urlParsed.query.id,
		data	= {'global': res.globalData},
		tasks	= [];

	data.global.menuControllerName = 'adminCmsPages';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) return cb(new Error('Invalid rights'), req, res, {});

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {
		// Basic form validation
		tasks.push(function (cb) {
			if ( ! res.globalData.formFields.name) {
				res.globalData.errors = ['Page name is required'];
				return cb(new Error('Invalid fields'));
			}

			cb();
		});

		// Save the data
		tasks.push(function (cb) {
			const	saveObj = {'name': res.globalData.formFields.name, 'langs': {}};

			let	fieldName,
				field,
				lang;

			if (pageId !== undefined)
				saveObj.id = pageId;

			if (res.globalData.formFields.published) {
				saveObj.published = true;
			} else {
				saveObj.published = false;
			}

			for (field in res.globalData.formFields) {
				if (field.split('.').length === 2) {
					fieldName	= field.split('.')[0];
					lang	= field.split('.')[1];

					if (saveObj.langs[lang] === undefined) {
						saveObj.langs[lang] = {};
					}

					if ( ! res.globalData.formFields[field]) {
						saveObj.langs[lang][fieldName] = null;
					} else {
						if (fieldName === 'slug') {
							res.globalData.formFields[field] = _.trimEnd(res.globalData.formFields[field], '/');
						}

						saveObj.langs[lang][fieldName] = res.globalData.formFields[field];
					}
				}
			}

			cms.savePage(saveObj, function (err, entry) {
				if (err) return cb(err);

				// Redirect to a new URL if a new pageId was created
				if ( ! pageId) {
					req.session.data.nextCallData	= {'global': {'messages': ['New page created with ID ' + entry.id]}};
					res.statusCode	= 302;
					res.setHeader('Location', '/adminCmsPageEdit?id=' + entry.id + '&langs=' + res.globalData.urlParsed.query.langs);
					pageId	= entry.id;
				}

				data.global.messages = ['Saved'];

				cb();
			});
		});
	}

	// Delete a page
	if (res.globalData.formFields.delete !== undefined && pageId !== undefined) {
		tasks.push(function (cb) {
			cms.rmPage(pageId, function (err) {
				if (err) return cb(err);

				req.session.data.nextCallData	= {'global': {'messages': ['Page with ID ' + pageId + ' deleted']}};
				res.statusCode	= 302;
				res.setHeader('Location', '/adminCmsPages');
				cb();
			});
		});
	}

	// Load data from database
	else if (pageId !== undefined) {
		tasks.push(function (cb) {
			cms.getPages({'ids': pageId}, function (err, rows) {
				let	lang;

				if (rows[0] !== undefined) {
					res.globalData.formFields = {
						'name':	rows[0].name,
						'published':	rows[0].published,
					};

					for (lang in rows[0].langs) {
						res.globalData.formFields['htmlTitle.'	+ lang] = rows[0].langs[lang].htmlTitle;
						res.globalData.formFields['slug.'	+ lang] = rows[0].langs[lang].slug;
						res.globalData.formFields['body1.'	+ lang] = rows[0].langs[lang].body1;
						res.globalData.formFields['body2.'	+ lang] = rows[0].langs[lang].body2;
						res.globalData.formFields['body3.'	+ lang] = rows[0].langs[lang].body3;
						res.globalData.formFields['body4.'	+ lang] = rows[0].langs[lang].body4;
						res.globalData.formFields['body5.'	+ lang] = rows[0].langs[lang].body5;
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
