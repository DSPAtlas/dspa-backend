import express from 'express';
import { 
    returnTreatmentGroup, 
    returnProteinForTreatmentGroup 
} from '../controllers/treatmentController.js'; 

const router = express.Router();

router.get('/treatment', returnTreatmentGroup);
router.get('/protein', returnProteinForTreatmentGroup);

export default router;
