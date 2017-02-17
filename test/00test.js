'use strict';

const	dockerImgName	= 'larvitcmstest',
	assert	= require('assert'),
	runCmd	= require('larvitruncmd'),
	exec	= require('child_process').exec;

let	containerId;

if (process.argv.indexOf('--bail') === - 1 && process.argv.indexOf('-b') === - 1) {
	console.error('For this test mocha must be ran with "--bail" (or the equalient "-b")');
	process.exit(1);
}

describe('Setup environment', function() {
	it('should build the docker image', function(done) {
		this.timeout(10 * 60 * 1000); // 10 minutes

		runCmd('docker build --no-cache -t ' + dockerImgName + ' ' + __dirname + '/../testEnv', {'silent': true}, function(err, exitCode) {
			if (err) throw err;
			assert.deepEqual(exitCode, 0);
			done();
		});
	});

	it('should run the container', function(done) {
		const	cmdStr	= 'docker run -d ' + dockerImgName;
		console.info(cmdStr);
		exec(cmdStr, function(err, stdout) {
			if (err) throw err;
			containerId = stdout;
			done();
		});
	});
});

describe('Tear down the environment', function() {
	it('should stop the container', function(done) {
		this.timeout(1 * 60 * 1000); // 1 minute

		runCmd('docker stop ' + containerId.substring(0, 12), {'silent': true}, function(err, exitCode) {
			if (err) throw err;
			assert.deepEqual(exitCode, 0);
			done();
		});
	});

	it('should remove the container', function(done) {
		this.timeout(1 * 60 * 1000); // 1 minute

		runCmd('docker rm ' + containerId.substring(0, 12), {'silent': true}, function(err, exitCode) {
			if (err) throw err;
			assert.deepEqual(exitCode, 0);
			done();
		});
	});

	it('should remove the docker image', function(done) {
		this.timeout(1 * 60 * 1000); // 1 minute

		runCmd('docker rmi ' + dockerImgName, {'silent': true}, function(err, exitCode) {
			if (err) throw err;
			assert.deepEqual(exitCode, 0);
			done();
		});
	});
});
