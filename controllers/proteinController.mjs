// backend/controllers/proteinController.js

import mysql2 from 'mysql2';

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


// Controller function to fetch protein by name and taxonomy ID
export const getProtein = (req, res) => {
  const { name, taxonomy_id } = req.query;
  db.query('SELECT * FROM protein WHERE name = ? AND taxonomy_id = ?', 
    [name, taxonomy_id], (err, results) => {
    if (err) {
      res.status(500).json({ error: 'Error fetching protein' });
    } else {
      if (results.length > 0) {
        res.json({ svg: results[0].svg });
      } else {
        res.status(404).json({ error: 'Protein not found' });
      }
    }
  });
};

