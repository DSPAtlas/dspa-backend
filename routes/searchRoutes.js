import express from 'express';
const router = express.Router();

import { searchEntries } from '../controllers/searchController.js';  

router.get('/', searchEntries);

export default router;