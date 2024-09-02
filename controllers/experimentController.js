import { getDifferentialAbundanceByExperimentID, 
    getExperimentMetaData, getGoEnrichmentResultsByExperimentID } from '../models/searchModel.js';
import { getProteinScoreforSingleExperiment } from '../models/experimentModel.js';
import Joi from 'joi';


const querySchemaExperiments = Joi.object({
    experimentID: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
});

export const returnExperiment = async(req, res) => {

    try {
        const { value, error } = querySchemaExperiments.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { experimentID, page, limit } = value;

    const offset = (page - 1) * limit;
    
    const metadata = await getExperimentMetaData(experimentID);
    const differentialabundance = await getDifferentialAbundanceByExperimentID(experimentID);
    const proteinScores = await getProteinScoreforSingleExperiment(differentialabundance);
    const goenrichmentresults = await getGoEnrichmentResultsByExperimentID(experimentID);

    console.log("proteinscores", proteinScores);
    
    if (metadata) {
        res.json({
            success: true,
            experimentData: {
                experimentID: experimentID, 
                submission: metadata.submission_timestamp,
                differentialAbundanceData: differentialabundance,
                proteinScores: proteinScores,
                goEnrichment: goenrichmentresults,
                page,
                limit
            }
        });
    } else {
        res.status(404).json({
            success: false,
            message: "No results found for the provided criteria."
        });
    }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};