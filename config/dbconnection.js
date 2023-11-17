// db/connection.js
const mysql = require('mysql2');
const config = require('../config/config'); // Adjust the path as needed

const connection = mysql.createConnection(config.database);

module.exports = connection;

app.post('/api/search', (req, res) => {
  const searchTerm = req.body.searchTerm;
  
  // Use the searchTerm in a SQL query
  const query = `SELECT * FROM your_table WHERE column_name LIKE '%${searchTerm}%'`;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ results });
  });
});