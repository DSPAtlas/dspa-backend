import express from 'express';
//import { searchController } from '../controllers/index.mjs';
import { getOrganisms } from '../controllers/organismController.mjs';

const organismRoutes = express.Router();


organismRoutes.get('/', async (req, res) => {
  try {
    await getOrganisms(req, res);
  } catch (error) {
    console.error('Error in route:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { organismRoutes };