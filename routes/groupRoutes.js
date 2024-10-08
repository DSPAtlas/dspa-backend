import express from 'express';
const router = express.Router();

import { returnGroup } from '../controllers/groupController.js';  

router.get('/', returnGroup);

export default router;