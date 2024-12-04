
import mysql from 'mysql2';

const db = mysql.createPool({
  host: "localhost", //'mysql',
  user: 'root',  
  //password: process.env.DB_PASSWORD || "dspa",
  database: process.env.DB_NAME || "dynaprotdb",
  port:  3306,
  //waitForConnections: true,
  //connectionLimit: 10,
 // queueLimit: 0,
  //connectTimeout: 10000 // 10 seconds
}).promise();

export default db;