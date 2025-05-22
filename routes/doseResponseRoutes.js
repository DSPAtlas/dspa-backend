import express from 'express';
import { doseResponseData } from '../controllers/doseResponseController.js';

const router = express.Router();

router.get('/', doseResponseData);
export default router;