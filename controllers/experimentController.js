import { getDifferentialAbundanceByExperimentID, 
    getExperimentMetaData, getGoEnrichmentResultsByExperimentID } from '../models/searchModel.js';
import Joi from 'joi';

export const searchExperiments = async (req, res) => {
    try {
        const { value, error } = querySchema.validate(req.query);
        
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.details[0].message
            });
        }
        
        const { searchTerm } = value;
        const experimentmetadata = await getExperimentMetaData(searchTerm);

        if (experimentmetadata.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No entries found for the given search term.'
            });
        } else if (experimentmetadata.length === 1) {
            return res.redirect(`/api/v1/experiments?experimentID=${encodeURIComponent(experimentmetadata[0].lipexperiment_id)}`);
        } else {
            console.log("fix");
        }
    } catch (error) {
        console.error('Error in searchExperiments:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


const querySchemaExperiments = Joi.object({
    experimentID: Joi.string().required()
});

export const returnExperiments = async(req, res) => {

    try {
        const { value, error } = querySchemaExperiments.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { experimentID } = value;

    const metadata = await getExperimentMetaData(experimentID);
    const differentialabundance = await getDifferentialAbundanceByExperimentID(experimentID);
    const goenrichmentresults = await getGoEnrichmentResultsByExperimentID(experimentID);
    
    if (metadata) {
        res.json({
            success: true,
            experimentData: {
                experimentID: experimentID, 
                submission: metadata.submission_timestamp,
                differentialAbundanceData: differentialabundance,
                goEnrichment: goenrichmentresults
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