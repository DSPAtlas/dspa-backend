import { 
    getDifferentialAbundanceByDynaProtExperiment, 
    getDynaProtExperimentMetaData, 
    getGoEnrichmentResultsByDynaProtExperiment,
    getSummarizedProteinScoreByDynaProtExperiment } from '../models/searchModel.js';
import Joi from 'joi';


const querySchemaExperiments = Joi.object({
    experimentID: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
});

const categorizeDataByExperiment = (data) => {
    const categorized = data.reduce((acc, curr) => {
        const experimentID = curr.dpx_comparison;
        let experimentEntry = acc.find(entry => entry.experimentID === experimentID);
        if (!experimentEntry) {
            experimentEntry = { experimentID, data: [] };
            acc.push(experimentEntry);
        }
        experimentEntry.data.push(curr);
        return acc;
    }, []);
    return categorized;
};


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
    
    const metadata = await  getDynaProtExperimentMetaData(experimentID);
    const differentialabundance = await getDifferentialAbundanceByDynaProtExperiment(experimentID);
    const proteinScores = await getSummarizedProteinScoreByDynaProtExperiment(experimentID);
    const goenrichmentresults = await getGoEnrichmentResultsByDynaProtExperiment(experimentID);

    const differentialAbundanceDataList = categorizeDataByExperiment(differentialabundance);

    if (metadata) {
        res.json({
            success: true,
            experimentData: {
                experimentID: experimentID, 
                metaData: metadata[0],
                differentialAbundanceDataList: differentialAbundanceDataList,
                proteinScores: proteinScores,
                goEnrichmentData: goenrichmentresults,
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




