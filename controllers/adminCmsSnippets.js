'use strict';

const	utils	= require('../models/utils.js'),
	cms	= require('larvitcms');

exports.run = function (req, res, cb) {
	const	data	= {'global': res.globalData};

	data.global.controllerName = 'adminCmsSnippets';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) {
		utils.deny(res);
		return cb(null, req, res, null);
	}

	if (res.langs) {
		data.global.langs = res.langs;
	}

	cms.getSnippets({'onlyNames': true}, function (err, snippets) {
		data.cmsSnippets = snippets;
		cb(null, req, res, data);
	});
};
