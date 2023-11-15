const express = require('express');
const router = express.Router();

// Define API routes
router.get('/api/data', (req, res) => {
  // Retrieve data from the database or another source
  const data = { message: 'Hello from the backend!' };
  res.json(data);
});

module.exports = router;