import express from 'express';
import { searchController } from '../controllers/index.mjs';

const searchRoutes = express.Router();

searchRoutes.get('/', async (req, res) => {
  try {
    const result = await searchController.searchProteinFunction(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in route:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { searchRoutes };