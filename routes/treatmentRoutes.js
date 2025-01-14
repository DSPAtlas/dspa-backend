import express from 'express';
import { 
    returnTreatmentGroup, 
    returnConditions 
} from '../controllers/treatmentController.js'; 

const router = express.Router();

router.get('/condition', returnConditions);
router.get('/treatment', returnTreatmentGroup);

export default router;
