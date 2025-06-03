
import { getProteinDataByName } from './searchModel.js';
import { getDifferentialAbundanceByAccession } from './searchModel.js';




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


  // Helper function to process data for a single experiment
  function processExperimentData(data) {
    const maxIndex = Math.max(...data.map(row => Math.round(row.pos_end)));
    const len_vector = new Array(maxIndex + 1).fill(0); // +1 because arrays are 0-indexed
    const len_vector_detected = new Array(maxIndex + 1).fill(0);
    const scores = new Array(maxIndex + 1).fill(null);

    const qvalue_cutoff = 0.05;
    const log2FC_cutoff = 0.2;

    data.forEach(row => {
      const start = Math.round(row.pos_start);
      const end = Math.round(row.pos_end);
      const log2FC = !isFinite(row.diff) ? 0 : row.diff;
      const qvalue = row.adj_pval;
      const score = -Math.log10(qvalue) + Math.abs(log2FC);

      for (let i = start; i < end; i++) {
        if (i < len_vector.length) {
          scores[i] = score;
          if (qvalue < qvalue_cutoff && Math.abs(log2FC) > log2FC_cutoff) {
            len_vector[i] = len_vector[i] !== 0 ? (len_vector[i] + log2FC) / 2 : log2FC;
          } else {
            len_vector_detected[i] = 1;
          }
        }
      }
    });

    return len_vector.map((sig, index) => ({
      index,
      sig: isNaN(sig) ? null : sig,
      aminoacid: proteinSequence[index] || '',
      detected: len_vector_detected[index] || null,
      score: scores[index]
    }));
  }

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
    acc[dpx_comparison] = processExperimentData(experiments[dpx_comparison]);
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
  