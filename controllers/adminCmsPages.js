'use strict';

function run(req, res, cb) {
	res.data = {global: res.globalData};
	const data = res.data;

	data.global.menuControllerName = 'adminCmsPages';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null);
	}

	if (res.langs) {
		data.global.langs = res.langs;
	}

	req.cms.getPages({limit: false}, function (err, rows) {
		data.cmsPages = rows;
		cb(null);
	});
};

module.exports = run;
module.exports.run = run;
