const express = require('express');

const apiRoutes = require('./routes/api');
const config = require('./config/config');
const connection = require('./db/connection');



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