'use strict';

const	Intercom	= require('larvitamintercom'),
	userLib	= require('larvituser'),
	lUtils	= require('larvitutils'),
	dbConf	= {'socketPath': '/run/mysqld/mysqld.sock', 'user': 'root', 'pass': '', 'database': 'larvit'},
	db	= require('larvitdb');

if ( ! process.env.amqpConf) {
	throw new Error('amqpConf environment variable is not set');
}

// Set userLib to standalone mode (or use "slave" if another master-instance is running)
userLib.dataWriter.mode	= 'master';
lUtils.instances.intercom	= new Intercom(process.env.amqpConf);

// Connect to the database
db.setup(dbConf);

// Create a user to work with
userLib.create('foo', 'bar', {'role': 'admin'}, function (err) {
	if (err) throw err;

	require('larvitadmingui')({
		'port': 80
	});
});
