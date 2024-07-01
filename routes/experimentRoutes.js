import express from 'express';
import { returnExperiments } from '../controllers/experimentController.js';

const router = express.Router();

router.get('/', returnExperiments);
export default router;