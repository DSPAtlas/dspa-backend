import mysql2 from 'mysql2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to read SQL file
const readSQLFile = (fileName) => {
  const filePath = path.join(__dirname, '..', 'sql', fileName);
  return fs.readFileSync(filePath, 'utf8');
};

// Connect to MySQL database
const db = mysql2.createConnection({
  host: 'localhost',
  user: 'postgres',
  password: 'dspa',
  database: 'dspasample'
});

db.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('Connected to the MySQL database');
});

// Controller function to fetch organisms
export const getOrganisms = (req, res) => {
  const sqlQuery = readSQLFile('../sql/getOrganisms.sql');

  db.query(sqlQuery, (err, result) => {
    if (err) {
      res.status(500).json({ error: 'Error fetching organisms' });
    } else {
      res.json(result);
    }
  });
};
