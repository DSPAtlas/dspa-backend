
import mysql from 'mysql2';

const db = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,  
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000 // 10 seconds
}).promise();

export default db;