import express from 'express';
const router = express.Router();

import { searchEntries } from '../controllers/searchController';  

router.get('/', searchEntries);

export default router;