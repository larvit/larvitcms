'use strict';

const utils = require('../models/utils.js');

function run(req, res, cb) {
	res.data = {global: res.globalData};
	const data = res.data;

	data.global.controllerName = 'adminCmsSnippets';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null);
	}

	if (res.langs) {
		data.global.langs = res.langs;
	}

	req.cms.getSnippets({onlyNames: true}, function (err, snippets) {
		data.cmsSnippets = snippets;
		cb(null);
	});
};

module.exports = run;
module.exports.run = run;
