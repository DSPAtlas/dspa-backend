import express from 'express';
import { 
    returnconditionGroup, 
    returnConditions 
} from '../controllers/conditionController.js'; 

const router = express.Router();

router.get('/condition', returnConditions);
router.get('/condition', returnconditionGroup);

export default router;
