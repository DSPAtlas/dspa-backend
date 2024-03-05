// routes/index.mjs
import express from 'express';
import { searchRoutes } from './searchRoutes.mjs';
import { tablesRoutes } from './tablesRoutes.mjs';
import { organismRoutes } from './organismRoutes.mjs';
import { proteinRoutes } from './proteinRoutes.mjs';


const router = express.Router();

//router.use('/search', searchRoutes);
// router.use('/tables', tablesRoutes);
// Mount organism routes
router.use('/api/organisms', organismRoutes);
// Mount protein routes
router.use('/api/protein', proteinRoutes);

const testapi = (req, res) => {
    res.status(200).json({ error: 'is working' });
}
router.use('/api/test', testapi);

export default router;