import express from 'express';
//import { searchController } from '../controllers/index.mjs';
import { searchProteinFunction, getProtein } from '../controllers/index.mjs';
import { getTableNames } from '../controllers/index.mjs';

const proteinRoutes = express.Router();

proteinRoutes.get('/', async (req, res) => {
    try {
      const result = await getProtein(req, res);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in route:', error.message);
      res.status(500).json({ message: 'Internal Server Error' });
    }
});

export { proteinRoutes };