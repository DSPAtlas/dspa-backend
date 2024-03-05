import express from 'express';
//import { searchController } from '../controllers/index.mjs';
import { getProtein } from '../controllers/proteinController.mjs';

const proteinRoutes = express.Router();

proteinRoutes.get('/', async (req, res) => {
    try {
        await getProtein(req, res);
    } catch (error) {
        console.error('Error in route:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

export { proteinRoutes };