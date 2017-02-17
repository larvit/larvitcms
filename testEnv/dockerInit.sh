#!/bin/sh

# Start MariaDB
echo "### Running mysql_install_db"
mysql_install_db --user=mysql

echo "### Starting MariaDB"
/usr/bin/mysqld_safe --max-allowed-packet=1073741824 --skip-networking --datadir="/var/lib/mysql" &

echo "### Waiting for MariaDB to start"
while !(mysqladmin ping)
do
	echo "waiting for MariaDB ..."
done

echo "### MariaDB socket is available, create database"
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS larvit"

echo "### Running node application"
cd /srv
node ./index.js
