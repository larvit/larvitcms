'use strict';

const	userLib	= require('larvituser'),
	dbConf	= {'socketPath': '/run/mysqld/mysqld.sock', 'user': 'root', 'pass': '', 'database': 'larvit'},
	db	= require('larvitdb');

// Set userLib to standalone mode (or use "slave" if another master-instance is running)
userLib.dataWriter.mode = 'master';

// Connect to the database
db.setup(dbConf);

// Create a user to work with
userLib.create('foo', 'bar', {'role': 'admin'}, function(err) {
	if (err) throw err;

	require('larvitadmingui')({
		'port': 80
	});
});
