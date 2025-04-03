import express from 'express';
import { 
    returnconditionGroup, 
    returnConditions 
} from '../controllers/conditionController.js'; 

const router = express.Router();

router.get('/allconditions', returnConditions);
router.get('/data', returnconditionGroup);

export default router;
