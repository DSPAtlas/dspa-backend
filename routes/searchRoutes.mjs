import express from 'express';
import { searchController } from '../controllers/index.mjs';

const router = express.Router();

router.get('/search', async (req, res) => {
    try {
      const result = await searchController.searchProteinFunction(req, res);
      // Handle the result as needed
    } catch (error) {
      // Handle errors appropriately
      console.error('Error in route:', error.message);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  export default router;