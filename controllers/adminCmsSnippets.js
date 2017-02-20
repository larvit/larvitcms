'use strict';

const	cms	= require('larvitcms');

exports.run = function(req, res, cb) {
	const	data	= {'global': res.globalData};

	data.global.menuControllerName = 'adminCmsPages';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) return cb(new Error('Invalid rights'), req, res, {});

	if (res.langs) {
		data.global.langs = res.langs;
	}

	cms.getSnippets({'onlySlugs': true}, function(err, snippets) {
		data.cmsSnippets = snippets;
		cb(null, req, res, data);
	});
};
