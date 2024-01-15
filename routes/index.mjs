// routes/index.mjs
import express from 'express';
import { searchRoutes } from './searchRoutes.mjs';
import { tablesRoutes } from './tablesRoutes.mjs';

const router = express.Router();

router.use('/search', searchRoutes);
router.use('/tables', tablesRoutes);

export default router;