import { 
    getDifferentialAbundanceByDynaProtExperiment, 
    getDynaProtExperimentMetaData, 
    getGoEnrichmentResultsByDynaProtExperiment,
    getSummarizedProteinScoreByDynaProtExperiment,
    getTopChangingPeptidesByDynaProtExperiment,
    getDistinctDoseByExperimentComparisonIDs } from '../models/searchModel.js';
import Joi from 'joi';


const querySchemaExperiments = Joi.object({
    experimentID: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    includeQcPdf: Joi.boolean().default(false)
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
    
    const { experimentID, page, limit, includeQcPdf } = value;

    const offset = (page - 1) * limit;
    
    const [
        metadata,
        differentialabundance,
        proteinScores,
        topChangingPeptides,
        goenrichmentresults
    ] = await Promise.all([
        getDynaProtExperimentMetaData(experimentID, { includeQcPdf }),
        getDifferentialAbundanceByDynaProtExperiment(experimentID),
        getSummarizedProteinScoreByDynaProtExperiment(experimentID),
        getTopChangingPeptidesByDynaProtExperiment(experimentID),
        getGoEnrichmentResultsByDynaProtExperiment(experimentID)
    ]);

    const differentialAbundanceDataList = categorizeDataByExperiment(differentialabundance);

    // Enrich each comparison with a `dose` field for display (e.g., volcano plot title)
    const comparisonIDs = differentialAbundanceDataList.map(e => e.experimentID);
    
    // Also include comparison IDs from topChangingPeptides if not already there
    const topPeptideComparisonIDs = [...new Set(topChangingPeptides.map(p => p.dpx_comparison))];
    const allComparisonIDs = [...new Set([...comparisonIDs, ...topPeptideComparisonIDs])];

    const doseRows = await getDistinctDoseByExperimentComparisonIDs(allComparisonIDs);
    const doseByComparisonID = new Map(doseRows.map(r => [r.dpx_comparison, r.dose]));

    differentialAbundanceDataList.forEach(entry => {
      entry.dose = doseByComparisonID.get(entry.experimentID) ?? entry.experimentID;
    });

    // Enrich topChangingPeptides with dose/comparison title
    const enrichedTopPeptides = topChangingPeptides.map(p => ({
        ...p,
        comparison: doseByComparisonID.get(p.dpx_comparison) ?? p.dpx_comparison
    }));

    if (metadata) {
        res.json({
            success: true,
            experimentData: {
                experimentID: experimentID,
                metaData: metadata[0],
                differentialAbundanceDataList: differentialAbundanceDataList,
                proteinScores: proteinScores,
                topChangingPeptides: enrichedTopPeptides,
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




