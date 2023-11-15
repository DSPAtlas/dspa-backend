// db/connection.js
const mysql = require('mysql2');
const config = require('../config/config'); // Adjust the path as needed

const connection = mysql.createConnection(config.database);

module.exports = connection;