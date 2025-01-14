import { 
    getConditions,
    getDifferentialAbundanceByExperimentID,
    getExperimentsByTreatment, 
    getProteinScoreforSingleExperiment,
    getGoEnrichmentResultsByExperimentID

} from '../models/searchModel.js';


import Joi from 'joi';


const queryTreatment = Joi.object({
    treatment: Joi.string().trim().required()
});

const combineExperiments = (data) => {
    const combinedData = {};

    // Iterate over each experiment (since `data` is an array)
    data.forEach((experiment) => {
        const experimentID = experiment.experimentID;
        const experimentEntries = experiment.data; // Get the experiment data, which is an array

        // Check if experimentEntries is an array
        if (Array.isArray(experimentEntries)) {
            experimentEntries.forEach(entry => {
                const proteinAccession = entry.pg_protein_accessions;
                const cumulativeScore = entry.cumulativeScore;

                // Initialize the protein data if not already present
                if (!combinedData[proteinAccession]) {
                    combinedData[proteinAccession] = {
                        experiments: {},
                        averageScore: 0,
                        count: 0
                    };
                }

                // Add the cumulative score for the experiment
                combinedData[proteinAccession].experiments[experimentID] = cumulativeScore;
                combinedData[proteinAccession].count += 1;
                combinedData[proteinAccession].averageScore += cumulativeScore;
            });
        } else {
            console.error(`Expected array but got ${typeof experimentEntries} for experimentID: ${experimentID}`);
        }
    });

    // Calculate average scores and filter out entries with averageScore 0 or NA
    let filteredData = Object.keys(combinedData).reduce((result, proteinAccession) => {
        const entry = combinedData[proteinAccession];
        entry.averageScore /= entry.count;

        // Filter out entries where averageScore is 0, null, or undefined
        if (entry.averageScore !== 0 && entry.averageScore !== null && entry.averageScore !== undefined) {
            result.push({ proteinAccession, ...entry });
        }

        return result;
    }, []);

    // Sort by averageScore in descending order
    filteredData.sort((a, b) => b.averageScore - a.averageScore);

    return filteredData;
};

export const returnConditions = async (req, res) => {
    try {
        const conditions = await getConditions();

        if (conditions && conditions.length > 0) {
            res.json({
                success: true,
                conditions: conditions.map(c => c.condition),
            });
        } else {
            res.status(404).json({
                success: false,
                message: "No conditions found for the provided criteria."
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

export const returnTreatmentGroup = async(req, res) => {
    try {
        const { value, error } = queryTreatment.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { treatment } = value;
    const experimentIDsList = await getExperimentsByTreatment(treatment);
    
    let differentialAbundanceDataList = [];
    let proteinScoresList = [];
    let goEnrichmentList = [];

    for (let experiment of experimentIDsList) {
        const experimentID = experiment.lipexperiment_id;
        
        // Fetch all data concurrently
        const [differentialAbundance, proteinScores, goEnrichmentResults] = await Promise.all([
            getDifferentialAbundanceByExperimentID(experimentID),
            getProteinScoreforSingleExperiment(experimentID),
            getGoEnrichmentResultsByExperimentID(experimentID)
        ]);
    
        differentialAbundanceDataList.push({
            experimentID,
            data: differentialAbundance
        });
    
        proteinScoresList.push({
            experimentID,
            data: proteinScores
        });
    
        goEnrichmentList.push({
            experimentID,
            data: goEnrichmentResults
        });
    }
    

    const proteinScoresTable = combineExperiments(proteinScoresList);

    if (experimentIDsList) {
         res.json({
             success: true,
             treatmentData: {
                treatment: treatment, 
                experimentIDsList: experimentIDsList, 
                differentialAbundanceDataList: differentialAbundanceDataList,
                proteinScoresTable: proteinScoresTable,
                goEnrichmentList: goEnrichmentList
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
