'use strict';

after(function () {
	setTimeout(function () {
		process.exit();
	}, 1000);
});
