// Helper function to process data for a single experiment
export const getProteinScoreforSingleExperiment= async(jsonData) => {
    /**
     * Prepare data for ranking
     * 
     * @param {json} jsonData
     * 
     * @typedef {Object} DataPoint
     * @property {string} pg_protein_accession - The name of the protein.
     * @property {number} cumulativeScore - The cumulative score for the protein.
     * @property {string} protein_description - The description of the protein.
     *
     * @returns {Object[]} An array of objects with properties `protein` and `cumulativeScore`.
     */

    function processProteinData(data) {
        const qvalue_cutoff = 0.05;
        const log2FC_cutoff = 0.2;

        // Object to store the cumulative scores per protein
        const proteinScores = {};

        data.forEach(row => {
            const start = Math.round(row.pos_start);
            const end = Math.round(row.pos_end);
            const log2FC = !isFinite(row.diff) ? 0 : row.diff;
            const qvalue = row.adj_pval;
            const score = -Math.log10(qvalue) + Math.abs(log2FC);

            // Initialize the protein in the proteinScores object if it doesn't exist
            if (!proteinScores[row.pg_protein_accessions]) {
                proteinScores[row.pg_protein_accessions] = 0;
            }

            // Update the score for the protein
            for (let i = start; i < end; i++) {
                if (i < row.seq.length) {
                    if (qvalue < qvalue_cutoff && Math.abs(log2FC) > log2FC_cutoff) {
                        proteinScores[row.pg_protein_accessions] += score;
                    }
                }
            }
        });

        // Convert the proteinScores object to an array of { protein, cumulativeScore } objects
        return Object.entries(proteinScores).map(([pg_protein_accessions, cumulativeScore, protein_description ]) => ({
            pg_protein_accessions,
            cumulativeScore,
            protein_description
        }));
    }

    // Directly process the single experiment's data
    const processedData = processProteinData(jsonData);

    return processedData;
}
