import pg from 'pg'; 
const { Client } = pg; 
import config from '../config/config.mjs';

const db = new Client({
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
});

export default db;