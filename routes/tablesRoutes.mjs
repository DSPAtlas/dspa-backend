import express from 'express';
import { tablesController } from '../controllers/index.mjs';

const router = express.Router();

router.get('/tables', async (req, res) => {
    try {
      const result = await tablesController.getTableNames(req, res);
      // Handle the result as needed
    } catch (error) {
      // Handle errors appropriately
      console.error('Error in route:', error.message);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  export default router;