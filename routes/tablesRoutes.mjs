import express from 'express';
import { tablesController } from '../controllers/index.mjs';

const tablesRoutes = express.Router();

tablesRoutes.get('/', async (req, res) => {
  try {
    const result = await tablesController.getTableNames(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in route:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { tablesRoutes };