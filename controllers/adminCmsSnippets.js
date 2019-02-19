'use strict';

const utils = require('../models/utils.js');

exports.run = function (req, res, cb) {
	res.data = {global: res.globalData};
	res.data.global.controllerName = 'adminCmsSnippets';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null, req, res, null);
	}

	if (res.langs) {
		res.data.global.langs = res.langs;
	}

	req.cms.getSnippets({onlyNames: true}, function (err, snippets) {
		res.data.cmsSnippets = snippets;
		cb(null, req, res, data);
	});
};
