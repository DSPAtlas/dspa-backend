import express from 'express';
import { getAllExperimentsHandler } from '../controllers/allExperimentsController.js';

const router = express.Router();

router.get('/', getAllExperimentsHandler);
export default router;