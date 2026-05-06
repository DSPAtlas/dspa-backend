import { 
    getDifferentialAbundanceByDynaProtExperiment, 
    getDynaProtExperimentMetaData, 
    getGoEnrichmentResultsByDynaProtExperiment,
    getSignificantProteinsByDynaProtExperiment,
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
    const requestStart = process.hrtime.bigint();

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
        significantProteins,
        goenrichmentresults
    ] = await Promise.all([
        getDynaProtExperimentMetaData(experimentID, { includeQcPdf }),
        getDifferentialAbundanceByDynaProtExperiment(experimentID),
        getSignificantProteinsByDynaProtExperiment(experimentID),
        getGoEnrichmentResultsByDynaProtExperiment(experimentID)
    ]);

    const differentialAbundanceDataList = categorizeDataByExperiment(differentialabundance);

    // Enrich each comparison with a `dose` field for display (e.g., volcano plot title)
    const comparisonIDs = differentialAbundanceDataList.map(e => e.experimentID);
    
    const proteinComparisonIDs = [...new Set(significantProteins.map(protein => protein.dpx_comparison).filter(Boolean))];
    const allComparisonIDs = [...new Set([...comparisonIDs, ...proteinComparisonIDs])];

    const doseRows = await getDistinctDoseByExperimentComparisonIDs(allComparisonIDs);
    const comparisonLabelByComparisonID = new Map(
        doseRows.map((row) => [
            row.dpx_comparison,
            row.comparison_label ?? row.dose ?? row.dpx_comparison
        ])
    );

    differentialAbundanceDataList.forEach(entry => {
      entry.dose = comparisonLabelByComparisonID.get(entry.experimentID) ?? entry.experimentID;
    });

    const enrichedSignificantProteins = significantProteins.map((protein) => ({
        ...protein,
        comparison: comparisonLabelByComparisonID.get(protein.dpx_comparison) ?? protein.dpx_comparison
    }));

    if (Array.isArray(metadata) && metadata.length > 0) {
        const experimentMetadata = metadata[0];
        const requestDurationMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
        console.info(
            `[Performance] Experiment endpoint ${experimentID} processed in ${requestDurationMs.toFixed(2)} ms`
        );

        res.json({
            success: true,
            experimentData: {
                experimentID: experimentID,
                perturbation: experimentMetadata.perturbation,
                metaData: experimentMetadata,
                differentialAbundanceDataList: differentialAbundanceDataList,
                proteinScores: enrichedSignificantProteins,
                significantProteins: enrichedSignificantProteins,
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



