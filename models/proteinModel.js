
import { getProteinDataByName } from './searchModel.js';
import { getDifferentialAbundanceByAccession } from './searchModel.js';




/**
 * Processes experimental data for a single experiment to calculate scores and significance vectors.
 * 
 * This function is called from `prepareData` to process each grouped experiment (dpx_comparison)
 * 
 * @param {Array<{pos_start: number, pos_end: number, diff: number, adj_pval: number}>} data - Array of experimental data rows.
 *   - `pos_start`: The starting position of the peptide in the protein sequence.
 *   - `pos_end`: The ending position of the peptide.
 *   - `diff`: The differential abundance log2 fold change.
 *   - `adj_pval`: The adjusted p-value (q-value) for significance.
 * @param {string} proteinSequence - The full amino acid sequence of the protein.
 * 
 * @returns {Array<{index: number, sig: number|null, aminoacid: string, detected: number|null, score: number}>} 
 *          An array of processed data points representing each position in the sequence up to maxIndex.
 *          Each element is an object with the following fields:
 *          - `index`: The zero-based position in the protein sequence.
 *          - `sig`: The significance value based on log2 fold change if thresholds are met
 *          - `aminoacid`: The single-letter amino acid code at this position.
 *          - `detected`: 1 if the position was covered by a peptide but did not meet significance thresholds, otherwise null.
 *          - `score`: Currently the averaged diff at this position
 */
export function processExperimentData(data, proteinSequence) {
  if (!data || data.length === 0) return [];

  const maxIndex = Math.max(...data.map(row => Math.round(row.pos_end)));
  
  // 1. Define arrays for sums and counts
  const sums = new Array(maxIndex + 1).fill(0);
  const counts = new Array(maxIndex + 1).fill(0);

  // 2. Accumulate sums and counts
  data.forEach(row => {
    // If we ever get fractional indices, it will work wrongly and will not signal the error
    // Rounding for peace of mind. We mostly expect integer indices.
    const start = Math.round(row.pos_start);
    const end = Math.round(row.pos_end);

    const log2FC = !isFinite(row.diff) ? 0 : row.diff;
    const qvalue = row.adj_pval;
    const score = -Math.log10(qvalue) + Math.abs(log2FC);

    for (let i = start; i < end; i++) {
      if (i < sums.length) {
        sums[i] += score;
        counts[i] += 1;
      }
    }
  });

  // 3. Calculate averages where we have observed the values, null otherwise
  const averages = sums.map((sum, i) => counts[i] > 0 ? sum / counts[i] : null);

  // 4. Find min and max for normalization (ignoring nulls where count was 0)
  const validAverages = averages.filter(avg => avg !== null);
  const min = validAverages.length > 0 ? Math.min(...validAverages) : 0;
  const max = validAverages.length > 0 ? Math.max(...validAverages) : 0;

  // We cannot normalize with all values equal. Returning 0.5. Same if we do not have any valid values.
  const isDegenerate = min === max;

  // 5. Build the final array with normalized scores, setting sig and detected to 1
  return averages.map((avg, index) => {
    let normalizedScore = 1.0; // as per protti/R calculate_aa_scores.R
    
    if (avg !== null && !isDegenerate) {
      normalizedScore = (avg - min) / (max - min);
    }

    const isCovered = counts[index] > 0;

    return {
      index,
      sig: isCovered ? 1 : null,
      aminoacid: proteinSequence[index] || '',
      detected: isCovered ? 1 : null,
      score: normalizedScore
    };
  });
}

export const prepareData = (jsonData, proteinSequence) => {
  /**
   * Prepare data for barcode visualization
   * 
   * @param {json} jsonData
   * @param {string} proteinSequence
   * 
   * @typedef {Object} DataPoint
   * @property {number} index - The position of the item in the original data structure.
   * @property {number|null} sig - The numerical value from `item.value` or `null` if `item.value` is NaN.
   * @property {string} aminoacid - The amino acid represented by a string.
   * @property {number|null} detected - The numerical value from `dataframe_with_vector_detected` at the corresponding index or `null` if it is NaN.
   * @property {number} score - The score value from `item.score`.
   *
   * @returns {DataPoint[]} An array of objects with properties `index`, `sig`, `aminoacid`, `detected`, and `score`.
   */


  // Split data by experimentID
  const experiments = jsonData.reduce((acc, row) => {
    if (!acc[row.dpx_comparison]) {
      acc[row.dpx_comparison] = [];
    }
    acc[row.dpx_comparison].push(row);
    return acc;
  }, {});

  // Process each experiment's data
  const processedData = Object.keys(experiments).reduce((acc, dpx_comparison) => {
    acc[dpx_comparison] = processExperimentData(experiments[dpx_comparison], proteinSequence);
    return acc;
  }, {});

  return {processedData};
}



export const getProteinFeatures = async(proteinName) => {
  try {
    const fastaEntries = await getProteinDataByName(proteinName);
    if (fastaEntries.length === 0) {
      throw new Error("No protein found for the given taxonomy ID and protein name.");
    }
    const fastaEntry = fastaEntries[0];

    let pgProteinAccession;
    if (/^[A-Za-z0-9]+$/.test(fastaEntry.protein_name)) {
      pgProteinAccession = fastaEntry.protein_name;
    } else {
      pgProteinAccession = extractProteinAccession(fastaEntry.protein_name); 
    }
    const differentialAbundance = await getDifferentialAbundanceByAccession(pgProteinAccession);
    const {processedData} = prepareData(differentialAbundance, fastaEntry.seq);

  
    const result = {
      proteinName: pgProteinAccession,
      proteinSequence: fastaEntry.seq,
      differentialAbundanceData: processedData,
      proteinDescription: fastaEntry.protein_description
    };
    
    return result;
  } catch (error) {
    console.error("Error in getProteinFeatures:", error.message);
    throw error;
  }
};
  