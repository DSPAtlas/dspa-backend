import express from 'express';
import { returnExperiment } from '../controllers/experimentController.js';

const router = express.Router();

router.get('/', returnExperiment);
export default router;