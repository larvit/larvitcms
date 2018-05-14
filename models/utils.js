'use strict';

exports.deny = function deny(res) {
	res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
	res.end('403: Forbidden');
};
