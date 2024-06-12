
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import debug from 'debug';

import homeRoutes from './routes/homeRoutes.js';
import proteinRoutes from './routes/proteinRoutes.js';
//import structureRoutes from './src/routes/structureRoutes.js';

const startupDebugger = debug.default('app:startup');
const dbDebugger = debug.default('app:db');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;;

app.use(express.json());
app.use(helmet());

console.log('Environment:', app.get('env'));

if (app.get('env') === 'development') {
    app.use(morgan('tiny'));
    debug('app:startup')('Morgan enabled...');
}

app.use('/', homeRoutes); 
app.use('/api/v1/proteins', proteinRoutes);
//app.use('/proteinstruct', structureRoutes);

app.get('/search', (req, res) => {
    const { taxonomyID, proteinName } = req.query;
    res.redirect(`/api/v1/proteins?taxonomyID=${encodeURIComponent(taxonomyID)}&proteinName=${encodeURIComponent(proteinName)}`);
});

dbDebugger('Connected to the database...');

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

