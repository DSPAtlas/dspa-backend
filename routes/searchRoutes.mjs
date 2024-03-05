import express from 'express';
import { searchProteinFunction} from '../controllers/searchController2.mjs';


const searchRoutes = express.Router();

searchRoutes.get('/', async (req, res) => {
  try {
    const result = await searchProteinFunction(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in route:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { searchRoutes };