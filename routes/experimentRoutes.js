import express from 'express';
import { searchExperiments } from '../controllers/experimentController.js';

const router = express.Router();

router.get('/', searchExperiments);
export default router;