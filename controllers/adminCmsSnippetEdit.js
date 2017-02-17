'use strict';

const	async	= require('async'),
	cms	= require('larvitcms'),
	_	= require('lodash');

exports.run = function(req, res, cb) {
	const	tasks	= [],
		data	= {'global': res.globalData},
		slug	= res.globalData.urlParsed.query.slug;

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) return cb(new Error('Invalid rights'), req, res, {});

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {
		tasks.push(function(cb) {
			const	tasks	= [];

			let	field;

			function addTask(lang, body) {
				tasks.push(function(cb) {
					cms.saveSnippet({'slug': _.trimEnd(slug, '/'), 'lang': lang, 'body': body}, cb);
				});
			}

			for (field in res.globalData.formFields) {
				if (field.split('.').length === 2) {
					addTask(field.split('.')[1], res.globalData.formFields[field]);
				}
			}

			async.parallel(tasks, function(err) {
				if (err) {
					data.global.errors = ['Unknown save error'];
					return cb(err);
				}

				data.global.messages = ['Saved'];

				cb();
			});
		});
	}

	// Load data from database
	tasks.push(function(cb) {
		cms.getSnippets({'slugs': slug}, function(err, snippets) {
			let	lang;

			if (snippets[0] !== undefined) {
				for (lang in snippets[0].langs) {
					res.globalData.formFields['body.' + lang] = snippets[0].langs[lang];
				}
			}

			cb();
		});
	});

	async.series(tasks, function(err) {
		cb(err, req, res, data);
	});
};
