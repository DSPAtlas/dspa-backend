import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import searchRoutes from './routes/searchRoutes.js';
import tablesRoutes from './routes/tablesRoutes.js';
import config from './config/config.mjs';

// const app = express();

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// //app.use('/search', searchRoutes);
// //app.use('/tables', tablesRoutes);

// app.listen(config.server.backend_port, () => {
//   console.log(`Server is running at http://localhost:${config.server.backend_port}`);
// });