'use strict';

const	logPrefix	= 'larvitcms: controllers/cms.js - ',
	lfs	= require('larvitfs'),
	cms	= require('larvitcms'),
	log	= require('winston');

function call404(req, res, cb) {
	res.templateName	= '404';

	if (lfs.getPathSync('controllers/404.js')) {
		require(lfs.getPathSync('controllers/404.js')).run(req, res, cb);
	} else {
		const	err	= new Error(logPrefix + 'call404() - 404 controller not found');

		res.statusCode	= 500;
		data	= {};
		cb(err, req, res, {});
	}
}

exports.run = function (req, res, cb) {
	const	data	= {'global': res.globalData};

	if (req.lang === undefined) {
		if (res.langs !== undefined && res.langs[0] !== undefined) {
			req.lang = res.langs[0];
		} else {
			req.lang = 'en';
		}
	}

	if ( ! data.global.title) {
		data.global.title = '';
	}

	if (req.urlParsed.path.substring(req.urlParsed.path.length - 5) === '.json') {
		req.urlParsed.path = req.urlParsed.path.substring(0, req.urlParsed.path.length - 5);
	}

	cms.getPages({'slugs': req.urlParsed.path}, function (err, pages) {
		if (err) return cb(err, req, res, data);

		if (pages.length === 0) {
			log.verbose(logPrefix + 'CMS controller called, but no page found for slug: "' + req.urlParsed.path + '"');
			call404(req, res, cb);

			return;
		}

		// Take the first page that is found... if there are several, well, tough luck :D
		if (pages[0] !== undefined && pages[0].langs !== undefined && pages[0].langs[req.lang] !== undefined) {
			data.cmsData	= pages[0].langs[req.lang];
			data.cmsData.template	= pages[0].template;
			data.global.title	+= ' | ' + data.cmsData.htmlTitle;
			data.global.slugs	= {};
			for (const key in pages[0].langs) {
				data.global.slugs[key] = pages[0].langs[key].slug;
			}
		} else {
			log.verbose(logPrefix + 'CMS controller called, but no content found for slug: "' + req.urlParsed.path + '" and lang: "' + req.lang + '"');
			call404(req, res, cb);
			return;
		}

		cb(err, req, res, data);
	});
};
