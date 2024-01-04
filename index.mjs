import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import db from './db/db.js';
import config from './config/config.mjs';

const app = express();
const __filename = import.meta.url.slice(7); // Removing the 'file://' prefix
const __dirname = path.dirname(__filename);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('search', { sequence: null });
});

app.post('/search', async (req, res) => {
  const proteinName = req.body.proteinName;

  try {
    await db.connect();

    // Assuming you have a table named 'proteins' with columns 'name' and 'sequence'
    //const result = await db.query('SELECT sequence FROM proteins WHERE name = $1', [proteinName]);

    //if (result.rows.length > 0) {
      //const sequence = result.rows[0].sequence;
      //res.render('search', { sequence });
    //} else {
      //res.render('search', { sequence: 'Protein not found' });
    //}
  } catch (error) {
    console.error('Error executing query:', error.message);
    res.status(500).send('Internal Server Error');
  } finally {
    await db.end();
  }
});


app.listen(config.server.port, () => {
  console.log(`Server is running at http://localhost:${config.server.port}`);
});
