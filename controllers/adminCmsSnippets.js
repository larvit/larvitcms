'use strict';

var cms = require('larvitcms');

exports.run = function(req, res, callback) {
	var data = {'global': res.globalData};

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if ( ! res.adminRights) {
		callback(new Error('Invalid rights'), req, res, {});
		return;
	}

	cms.getSnippets({'onlySlugs': true}, function(err, snippets) {
		data.cmsSnippets = snippets;
		callback(null, req, res, data);
	});
};