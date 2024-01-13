import pg from 'pg'; 
const { Client } = pg; 
import config from '../config/config.mjs';
import mysql from 'mysql2/promise';
import {
  checkMySQLServerAvailability,
  checkMySQLConnectionPool,
  checkMySQLServerReachability,
  checkMySQLServerConfiguration,
  checkMySQLUserPermissions,
} from'../db/db_checks.js';


const dbConfigPool = config.databasepool;

// checkMySQLServerAvailability(dbConfigPool.host, dbConfigPool.port)
//   .then((result) => console.log(result))
//   .catch((error) => console.error(error));

// // checkMySQLConnectionPool(dbConfigPool)
// //   .then((isConnected) => {
// //     if (isConnected) {
// //       // Perform additional operations after successful connection
// //       console.log('Performing additional operations...');
// //     } else {
// //       // Handle the case where the connection failed
// //       console.log('Connection failed. Cannot perform additional operations.');
// //     }
// //   })
// //   .catch((error) => console.error(error));

// checkMySQLServerReachability(dbConfigPool.host)
//   .then((isReachable) => {
//     if (isReachable) {
//       console.log('MySQL server is reachable.');
//     } else {
//       console.log('MySQL server is not reachable.');
//     }
//   })
//   .catch((error) => console.error(error));

// checkMySQLServerConfiguration(dbConfigPool)
//   .then((configChecked) => {
//     if (configChecked) {
//       console.log('MySQL server configuration checked.');
//     } else {
//       console.log('Error checking MySQL server configuration.');
//     }
//   })
//   .catch((error) => console.error(error));


// checkMySQLUserPermissions(dbConfigPool)
//   .then((permissionsChecked) => {
//     if (permissionsChecked) {
//       console.log('MySQL user permissions checked.');
//     } else {
//       console.log('Error checking MySQL user permissions.');
//     }
//   })
//   .catch((error) => console.error(error));

//checkMySQLConnectionPool(dbConfigPool)


const pool = mysql.createPool({
  host: "localhost",
  user: "postgres",
  password: "dspa",
  database: "peptideatlas",
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  waitForConnections: true,
});

export const db = pool;

export async function query(text, params) {
  try {
    const conn = await pool.getConnection();
    // Execute the query using the pool
    const [rows, fields] = await conn.query(text, params);

    // Log the results (you can remove this if not needed)
    console.log(rows);
    console.log(fields);
    pool.releaseConnection(conn);
    // Return the result
    return rows;
  } catch (err) {
    // Log and handle errors
    console.log(err);
  } finally {
    // Always release the pool when done
    
    conn.release();
  }
};

export default db;


