import { 
    getConditions,
    getDifferentialAbundanceByExperimentIDs,
    getExperimentsByCondition, 
    getProteinScoresForMultipleExperiments,
    getGoEnrichmentResultsByExperimentIDs

} from '../models/searchModel.js';


import Joi from 'joi';


const querycondition = Joi.object({
    condition: Joi.string().trim().required()
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


const combineExperiments = (data) => {
    const combinedData = {};

    // Process each entry only once
    data.forEach(entry => {
        const { dpx_comparison: experimentID, pg_protein_accessions: proteinAccession, cumulativeScore, protein_description: protein_description } = entry;

        // Initialize the protein data structure if not already present
        if (!combinedData[proteinAccession]) {
            combinedData[proteinAccession] = {
                totalScore: 0,
                count: 0,
                protein_description // Store the protein description
            };
        }

        // Aggregate cumulative scores
        combinedData[proteinAccession].totalScore += cumulativeScore;
        combinedData[proteinAccession].count += 1;
    });

    // Convert to array and calculate average
    const result = Object.entries(combinedData).map(([proteinAccession, { totalScore, count, protein_description }]) => ({
        proteinAccession,
        averageScore: totalScore / count,
        count,
        protein_description
    }));

    // Sort by averageScore in descending order
    result.sort((a, b) => b.averageScore - a.averageScore);

    return result;
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

export const returnconditionGroup = async(req, res) => {
    try {
        const { value, error } = querycondition.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { condition } = value;

    const experimentIDs = await getExperimentsByCondition(condition);
    const experimentIDsList = experimentIDs.map(item => item.dpx_comparison);

    const [differentialAbundance, proteinScores, goEnrichmentResults] = await Promise.all([
        getDifferentialAbundanceByExperimentIDs(experimentIDsList),
        getProteinScoresForMultipleExperiments(experimentIDsList), 
        getGoEnrichmentResultsByExperimentIDs(experimentIDsList) 
    ]);

    const differentialAbundanceDataList = categorizeDataByExperiment(differentialAbundance);
    const goEnrichmentList = categorizeDataByExperiment(goEnrichmentResults);
    const proteinScoresTable = combineExperiments(proteinScores);
  
    if (experimentIDsList) {
         res.json({
             success: true,
             conditionData: {
                condition: condition, 
                experimentIDsList: experimentIDs, 
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
