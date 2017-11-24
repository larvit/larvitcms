'use strict';

const	slugify	= require('larvitslugify'),
	async	= require('async'),
	cms	= require('larvitcms');

exports.run = function (req, res, cb) {
	const	tasks	= [],
		data	= {'global': res.globalData},
		slug	= res.globalData.urlParsed.query.slug || slugify(res.globalData.formFields.slug);

	data.global.menuControllerName	= 'adminCmsSnippets';
	data.global.messages	= [];
	data.global.errors	= [];


	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) return cb(new Error('Invalid rights'), req, res, {});

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {

		tasks.push(function (cb) {
			const	tasks	= [];

			let	field;

			if (res.globalData.formFields.slug === '') {
				data.global.errors.push('Slug must be specified');
				return cb();
			}

			if (res.globalData.urlParsed.query.slug === undefined) {
				tasks.push(function (cb) {
					cms.getSnippets({'slugs': res.globalData.formFields.slug}, function (err, result) {
						if (err) return cb(err);
						if (result.length > 0) err = new Error('Snippet already exists');
						return cb(err);
					});
				});
			}

			function addTask(lang, body) {
				tasks.push(function (cb) {
					cms.saveSnippet({'slug': res.globalData.formFields.slug, 'lang': lang, 'body': body}, cb);
				});
			}

			for (field in res.globalData.formFields) {
				if (field.split('.').length === 2) {
					addTask(field.split('.')[1], res.globalData.formFields[field]);
				}
			}

			async.series(tasks, function (err) {
				if (err) {
					data.global.errors.push('Save error: ' + err.message);
					return cb();
				}

				res.statusCode	= 302;
				req.session.data.nextCallData	= {'global': {'messages': ['Saved']}};
				res.setHeader('Location', '/adminCmsSnippetEdit?slug=' + res.globalData.formFields.slug + '&langs=' + (res.globalData.urlParsed.query.langs || 'en'));
				cb();
			});
		});
	}

	if (slug !== undefined) {
		// Load data from database
		tasks.push(function (cb) {
			cms.getSnippets({'slugs': slug}, function (err, snippets) {
				let	lang;

				if (snippets[0] !== undefined) {
					for (lang in snippets[0].langs) {
						res.globalData.formFields['body.' + lang] = snippets[0].langs[lang];
					}
				}

				cb();
			});
		});
	}

	async.series(tasks, function (err) {
		cb(err, req, res, data);
	});
};
