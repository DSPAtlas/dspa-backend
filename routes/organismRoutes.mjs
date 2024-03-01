import express from 'express';
//import { searchController } from '../controllers/index.mjs';
import { getOrganisms } from '../controllers/index.mjs';

const organismRoutes = express.Router();


organismRoutes.get('/', async (req, res) => {
  try {
    const result = await getOrganisms(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in route:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { organismRoutes };