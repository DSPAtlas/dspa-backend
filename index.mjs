
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