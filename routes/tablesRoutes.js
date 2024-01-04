import express from 'express';
import { getTables } from '../controllers/tablesController.js';

const router = express.Router();

router.get('/tables', getTables);

export default router;