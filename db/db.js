import pg from 'pg'; 
const { Client } = pg; 
import {config} from '../config/config.mjs';
import mysql from 'mysql2';
import {
  checkMySQLServerAvailability,
  checkMySQLConnection,
  checkMySQLServerReachability,
  checkMySQLServerConfiguration,
  checkMySQLUserPermissions,
  checkMySQLConnectionPool,
} from'../db/db_checks.js';

const dbConfig = config.database;
const dbConfigPool = config.database_pool;

checkMySQLServerAvailability(dbConfig.host, dbConfigPool.port)
  .then((result) => console.log(result))
  .catch((error) => console.error(error));

checkMySQLConnection(dbConfig)
  .then((isConnected) => {
    if (isConnected) {
      // Perform additional operations after successful connection
      console.log('Performing additional operations...');
    } else {
      // Handle the case where the connection failed
      console.log('Connection failed. Cannot perform additional operations.');
    }
  })
  .catch((error) => console.error(error));

checkMySQLServerReachability(dbConfig.host)
  .then((isReachable) => {
    if (isReachable) {
      console.log('MySQL server is reachable.');
    } else {
      console.log('MySQL server is not reachable.');
    }
  })
  .catch((error) => console.error(error));

checkMySQLServerConfiguration(dbConfig)
  .then((configChecked) => {
    if (configChecked) {
      console.log('MySQL server configuration checked.');
    } else {
      console.log('Error checking MySQL server configuration.');
    }
  })
  .catch((error) => console.error(error));


checkMySQLUserPermissions(dbConfig)
  .then((permissionsChecked) => {
    if (permissionsChecked) {
      console.log('MySQL user permissions checked.');
    } else {
      console.log('Error checking MySQL user permissions.');
    }
  })
  .catch((error) => console.error(error));

checkMySQLConnectionPool(dbConfig)


const db = mysql.createPool({
  dbConfigPool
});


// Establish a connection to the database
// db.connect((err) => {
//   if (err) {
//     console.error('Error connecting to MySQL database:', err.message);
//     return;
//   }
//   console.log('Connected to MySQL database');
// });


// const db = new Client({
//   user: config.database.user,
//   host: config.database.host,
//   database: config.database.database,
//   password: config.database.password,
//   port: config.database.port,
// });

export default db;


// export default db;