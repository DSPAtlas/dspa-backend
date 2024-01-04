app.get('/api/tables', (req, res) => {
    getTableNames((err, tables) => {
      if (err) {
        res.status(500).json({ error: 'Error fetching table names' });
      } else {
        res.json({ tables });
      }
    });
  });
  

