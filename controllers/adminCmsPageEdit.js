'use strict';

var async = require('async'),
    cms   = require('larvitcms'),
    _     = require('lodash');

exports.run = function(req, res, callback) {
	var data   = {'global': res.globalData},
	    pageId = res.globalData.urlParsed.query.id,
	    tasks  = [];

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) {
		callback(new Error('Invalid rights'), req, res, {});
		return;
	}

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {
		tasks.push(function(cb) {
			var saveObj = {'name': res.globalData.formFields.name, 'langs': {}},
			    fieldName,
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
					fieldName = field.split('.')[0];
					lang      = field.split('.')[1];

					if (saveObj.langs[lang] === undefined)
						saveObj.langs[lang] = {};

					if ( ! res.globalData.formFields[field]) {
						saveObj.langs[lang][fieldName] = null;
					} else {
						saveObj.langs[lang][fieldName] = _.trimRight(res.globalData.formFields[field], '/');
					}
				}
			}

			cms.savePage(saveObj, function(err, entry) {
				if (err) {
					cb(err);
					return;
				}

				// Redirect to a new URL if a new pageId was created
				if ( ! pageId) {
					res.statusCode = 302;
					res.setHeader('Location', '/adminCmsPageEdit?id=' + entry.id + '&langs=' + res.globalData.urlParsed.query.langs);
					pageId = entry.id;
				}
				cb();
			});
		});
	}

	// Delete a page
	if (res.globalData.formFields.delete !== undefined && pageId !== undefined) {
		tasks.push(function(cb) {
			cms.rmPage(pageId, function(err) {
				if (err) {
					cb(err);
					return;
				}

				res.statusCode = 302;
				res.setHeader('Location', '/adminCmsPages');
				cb();
			});
		});
	}

	// Load data from database
	else if (pageId !== undefined) {
		tasks.push(function(cb) {
			cms.getPages({'ids': pageId}, function(err, rows) {
				var lang;

				if (rows[0] !== undefined) {
					res.globalData.formFields = {
						'name':      rows[0].name,
						'published': rows[0].published,
					};

					for (lang in rows[0].langs) {
						res.globalData.formFields['htmlTitle.' + lang] = rows[0].langs[lang].htmlTitle;
						res.globalData.formFields['slug.'      + lang] = rows[0].langs[lang].slug;
						res.globalData.formFields['body.'      + lang] = rows[0].langs[lang].body;
					}
				} else {
					cb(new Error('larvitcms: controllers/adminCmsPageEdit.js - Wrong pageId supplied'));
					return;
				}

				cb();
			});
		});
	}

	async.series(tasks, function(err) {
		callback(err, req, res, data);
	});
};