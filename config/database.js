
import mysql from 'mysql2';

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root" ,  
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "dynaprotdb",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000 // 10 seconds
}).promise();

export default db;