import express from 'express';
import { searchProtein } from '../controllers/searchController.js';

const router = express.Router();

router.post('/search', searchProtein);

export default router;