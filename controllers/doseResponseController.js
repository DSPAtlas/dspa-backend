import { getDoseResponseDataByProtein} from '../models/searchModel.js';
import Joi from 'joi';

const querySchema = Joi.object({
    dynaprotExperiment: Joi.string().trim().required(),
  proteinName: Joi.string().trim().required()
});


export const doseResponseData = async (req, res) => {

    const { value, error } = querySchema.validate(req.query);
    if (error) {
        return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
     });
        }

    const { dynaprotExperiment, proteinName } = value;
    try {
        const doseReponseData= await getDoseResponseDataByProtein(dynaprotExperiment, proteinName);
        
        if (doseReponseData.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No experiments found.'
            });
        }
        console.log("dose", doseResponseData);

        res.json({
            success: true,
            doseReponseDataPlotCurve: doseReponseData.doseResponseDataPlotCurve,
            doseReponseDataPlotPoints: doseReponseData.doseResponseDataPlotPoints
        });
        
    } catch (error) {
        console.error('Error in doseResponseData:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

