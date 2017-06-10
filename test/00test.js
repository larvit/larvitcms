'use strict';

const	dockerImgName	= 'larvitcmstest',
	waitForPort	= require('wait-for-port'),
	containers	= {'rabbit': {}, 'app': {}},
	validator	= require('validator'),
	request	= require('request'),
	assert	= require('assert'),
	runCmd	= require('larvitruncmd'),
	async	= require('async'),
	exec	= require('child_process').exec;

function testHttp(url, retry, cb) {
	if (typeof retry === 'function') {
		cb	= retry;
		retry	= 0;
	}

	if (retry === 0) {
		process.stdout.write('Waiting for ' + url + ' ');
	} else {
		process.stdout.write('.');
	}

	request(url, {timeout: 1000}, function (err, response) {
		if (err) {
			if (retry < 60 && (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' || err.code === 'ETIMEDOUT')) {
				setTimeout(function () {
					testHttp(url, retry + 1, cb);
				}, 1000);
				return;
			}

			throw err;
		}

		assert.deepEqual(response.statusCode,	200);
		process.stdout.write('done!\n');
		cb();
	});
}

describe('Setup environment', function () {
	it('should build the docker image', function (done) {
		this.timeout(10 * 60 * 1000); // 10 minutes

		//runCmd('docker build --no-cache -t ' + dockerImgName + ' ' + __dirname + '/../testEnv', {'silent': true}, function (err, exitCode) {
		runCmd('docker build -t ' + dockerImgName + ' ' + __dirname + '/../testEnv', {'silent': true}, function (err, exitCode) {
			if (err) {
				console.error('Could not build image: ' + err.message);
				process.exit(1);
			}

			assert.deepEqual(exitCode, 0);
			done();
		});
	});

	it('should run rabbitMQ', function (done) {
		const	cmdStr	= 'docker run -d rabbitmq';

		this.timeout(5 * 60 * 1000); // 5 minutes

		console.info(cmdStr);
		exec(cmdStr, function (err, stdout) {
			if (err) {
				console.error('Could not start RabbitMQ: ' + err.message);
				process.exit(1);
			}

			containers.rabbit.id	= stdout.replace(/^\s+|\s+$/g, '');

			// Get the container IP
			exec('docker inspect --format \'{{.NetworkSettings.IPAddress}}\' ' + containers.rabbit.id, function (err, stdout) {
				if (err) {
					console.error('Could not get RabbitMQ IP: ' + err.message);
					process.exit(1);
				}

				containers.rabbit.ip	= stdout.replace(/^\s+|\s+$/g, '');

				if ( ! validator.isIP(containers.rabbit.ip)) {
					console.error('Invalid IP gotten for RabbitMQ: "' + containers.rabbit.ip + '"');
					process.exit(1);
				}

				waitForPort(containers.rabbit.ip, 5672, function (err) {
					if (err) throw err;

					done();
				});
			});
		});
	});

	it('should run the app container', function (done) {
		const	cmdStr	= 'docker run -d -e "amqpConf=amqp://guest:guest@' + containers.rabbit.ip + '/" ' + dockerImgName;
		console.info(cmdStr);
		exec(cmdStr, function (err, stdout) {
			if (err) {
				console.error('Could not start the app container: ' + err.message);
				process.exit(1);
			}

			containers.app.id	= stdout.replace(/^\s+|\s+$/g, '');

			// Get the app container IP
			exec('docker inspect --format \'{{.NetworkSettings.IPAddress}}\' ' + containers.app.id, function (err, stdout) {
				if (err) {
					console.error('Could not get the app container IP: ' + err.message);
					process.exit(1);
				}

				containers.app.ip	= stdout.replace(/^\s+|\s+$/g, '');

				if ( ! validator.isIP(containers.app.ip)) {
					console.error('Invalid IP gotten for the app container: "' + containers.app.ip + '"');
					process.exit(1);
				}

				done();
			});
		});
	});
});

describe('Perform the tests', function () {
	it('should check so the site is up', function (done) {
		this.timeout(10 * 60 * 1000); // 10 minutes

		testHttp('http://' + containers.app.ip, function (err) {
			if (err) throw err;
			done();
		});
	});
});

describe('Tear down the environment', function () {
	this.timeout(1 * 60 * 1000); // 1 minute

	it('should stop the containers', function (done) {
		const	tasks	= [];

		for (const containerName of Object.keys(containers)) {
			const	container	= containers[containerName];

			tasks.push(function (cb) {
				runCmd('docker stop -t 1 ' + container.id, {'silent': true}, function (err, exitCode) {
					if (err) throw err;
					assert.deepEqual(exitCode, 0);
					cb();
				});
			});
		}

		async.series(tasks, done);
	});

	it('should remove the containers', function (done) {
		const	tasks	= [];

		for (const containerName of Object.keys(containers)) {
			const	container	= containers[containerName];

			tasks.push(function (cb) {
				runCmd('docker rm -f ' + container.id, {'silent': true}, function (err, exitCode) {
					if (err) throw err;
					assert.deepEqual(exitCode, 0);
					cb();
				});
			});
		}

		async.parallel(tasks, done);
	});

	/*it('should remove the docker image', function (done) {
		runCmd('docker rmi ' + dockerImgName, {'silent': true}, function (err, exitCode) {
			if (err) throw err;
			assert.deepEqual(exitCode, 0);
			done();
		});
	})*/;
});
