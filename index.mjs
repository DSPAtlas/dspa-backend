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
// });


const express = require('express');
const app = express();

// Import your routes
import { searchRoutes, tablesRoutes } from './routes';

// Use your routes
app.use('/api', searchRoutes); // Assumes '/api' as a base path for search routes
app.use('/api', tablesRoutes); // Assumes '/api' as a base path for tables routes

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});