'use strict';

exports.run = function (req, res, cb) {
	const data = {global: res.globalData};

	data.global.menuControllerName = 'adminCmsPages';

	// Make sure the user have the correct rights
	// This is set in larvitadmingui controllerGlobal
	if (!res.adminRights) {
		utils.deny(res);

		return cb(null, req, res, null);
	}

	if (res.langs) {
		data.global.langs = res.langs;
	}

	req.cms.getPages({limit: false}, function (err, rows) {
		data.cmsPages = rows;
		cb(null, req, res, data);
	});
};
