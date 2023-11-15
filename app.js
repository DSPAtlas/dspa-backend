const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const config = require('./config/config');
const connection = require('./db/connection');

const app = express();

app.use(cors()); // Enable CORS for all routes

// Other middleware and configurations...

// Use API routes
app.use('/api', apiRoutes);

// Start the server
app.listen(config.server.port, () => {
  console.log(`Server is running on port ${config.server.port}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  connection.end((err) => {
    if (err) {
      console.error('Error closing MySQL connection:', err);
    } else {
      console.log('MySQL connection closed');
    }
    process.exit();
  });
});