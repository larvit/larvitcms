'use strict';

const slugify = require('larvitslugify');
const async = require('async');

exports.run = function (req, res, cb) {
	const tasks = [];
	const data = {global: res.globalData};
	const name = res.globalData.urlParsed.query.name || slugify(res.globalData.formFields.name);

	data.global.menuControllerName = 'adminCmsSnippets';
	data.global.messages = [];
	data.global.errors = [];

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null, req, res, null);
	}

	// Save a POSTed form
	if (res.globalData.formFields.save !== undefined) {
		tasks.push(function (cb) {
			const tasks = [];

			let field;

			if (res.globalData.formFields.name === '') {
				data.global.errors.push('Name must be specified');

				return cb();
			}

			if (res.globalData.urlParsed.query.name === undefined) {
				tasks.push(function (cb) {
					req.cms.getSnippets({names: res.globalData.formFields.name}, function (err, result) {
						if (err) return cb(err);
						if (result.length > 0) err = new Error('Snippet already exists');

						return cb(err);
					});
				});
			}

			function addTask(lang, body) {
				tasks.push(function (cb) {
					req.cms.saveSnippet({name: res.globalData.formFields.name, lang: lang, body: body}, cb);
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

				res.statusCode = 302;
				req.session.data.nextCallData = {global: {messages: ['Saved']}};
				res.setHeader('Location', '/adminCmsSnippetEdit?name=' + res.globalData.formFields.name + '&langs=' + (res.globalData.urlParsed.query.langs || 'en'));
				cb();
			});
		});
	}

	if (name !== undefined) {
		if (res.globalData.formFields.delete === 'delete') {
			tasks.push(function (cb) {
				req.cms.rmSnippet(name, function (err) {
					if (err) return cb(err);
					res.statusCode = 302;
					req.session.data.nextCallData = {global: {messages: ['Successfully removed snippet']}};
					res.setHeader('Location', '/adminCmsSnippets');
					cb();
				});
			});
		} else {
			// Load data from database
			tasks.push(function (cb) {
				req.cms.getSnippets({names: name}, function (err, snippets) {
					let lang;

					if (snippets[0] !== undefined) {
						for (lang in snippets[0].langs) {
							res.globalData.formFields['body.' + lang] = snippets[0].langs[lang];
						}
					}

					cb();
				});
			});
		}
	}

	async.series(tasks, function (err) {
		cb(err, req, res, data);
	});
};
