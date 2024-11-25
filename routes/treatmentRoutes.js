import express from 'express';
import { 
    returnTreatmentGroup, 
    returnProteinForTreatmentGroup,
    returnConditions 
} from '../controllers/treatmentController.js'; 

const router = express.Router();

router.get('/condition', returnConditions);
router.get('/treatment', returnTreatmentGroup);
router.get('/protein', returnProteinForTreatmentGroup);

export default router;
