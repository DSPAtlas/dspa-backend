import express from 'express';
import { searchProteins } from '../controllers/proteinController.js';

const router = express.Router();

router.get('/', searchProteins);
export default router;