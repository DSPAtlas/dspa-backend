// const express = require('express');

// const apiRoutes = require('./routes/api');
// const config = require('./config/config');
// const connection = require('./db/connection');

// // Handle graceful shutdown
// process.on('SIGINT', () => {
//   connection.end((err) => {
//     if (err) {
//       console.error('Error closing MySQL connection:', err);
//     } else {
//       console.log('MySQL connection closed');
//     }
//     process.exit();
//   });
import config from './config/config.mjs';
import express from 'express';
import routes from './routes/index.mjs';

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(routes);

app.listen(config.server.backend_port, () => {
  console.log(`Server is running at http://localhost:${config.server.backend_port}`);
});