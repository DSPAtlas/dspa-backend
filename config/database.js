import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

import {Connector} from '@google-cloud/cloud-sql-connector';

dotenv.config();

const getIpType = () =>
  process.env.PRIVATE_IP === '1' || process.env.PRIVATE_IP === 'true'
    ? 'PRIVATE'
    : 'PUBLIC';

// connectWithConnector initializes a connection pool for a Cloud SQL instance
// of MySQL using the Cloud SQL Node.js Connector.

const connector = new Connector();
const clientOpts = await connector.getOptions({
    instanceConnectionName: "dspa-429113:europe-west6:dspasampledatabase",
    ipType: getIpType(),
  });

 const dbConfig = {
    ...clientOpts,
    user: "root", // e.g. 'my-db-user'
    password: "dspadatabase", // e.g. 'my-db-password'
    database: "dspasample"// e.g. 'my-database'
    // ... Specify additional properties here.
    //...config,
  
  };

const db = mysql.createPool(dbConfig);

// const db = mysql.createPool({
//   host: "34.65.172.124", //"127.0.0.1",//
//   user: "root",
//   password: "dspadatabase",
//   database: "dspasample",
//   //port: "3306",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   connectTimeout: 10000 // 10 seconds
// }).promise();

export default db;