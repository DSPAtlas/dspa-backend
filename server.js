import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import searchRoutes from './routes/searchRoutes.js';
import tablesRoutes from './routes/tablesRoutes.js';
import config from './config/config.mjs';

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/search', searchRoutes);
app.use('/tables', tablesRoutes);

app.listen(config.server.port, () => {
  console.log(`Server is running at http://localhost:${config.server.port}`);
});