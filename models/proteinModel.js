
import { getProteinDataByName } from './searchModel.js';
import { getDifferentialAbundanceByAccession } from './searchModel.js';
import { extractProteinAccession } from './searchModel.js';

export const AMINO_ACID_SCORE_METHODS = Object.freeze({
  MULTIPLICATIVE: 'multiplicative',
  ADDITIVE: 'additive'
});

// Reference aa_scores_*.tsv files were generated with the additive method.
// Change this constant to AMINO_ACID_SCORE_METHODS.MULTIPLICATIVE if needed.
export const AMINO_ACID_SCORE_METHOD = AMINO_ACID_SCORE_METHODS.ADDITIVE;

const calculateAminoAcidScore = (diff, adjPval, method = AMINO_ACID_SCORE_METHOD) => {
  if (method === AMINO_ACID_SCORE_METHODS.MULTIPLICATIVE) {
    return -Math.log10(adjPval) * Math.abs(diff);
  }

  if (method === AMINO_ACID_SCORE_METHODS.ADDITIVE) {
    return -Math.log10(adjPval) + Math.abs(diff);
  }

  throw new Error(`Unsupported amino acid score method: ${method}`);
};




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
 * @returns {Array<{index: number, sig: number|null, aminoacid: string, detected: number|null, score: number|null}>} 
 *          An array of processed data points representing each position in the sequence up to maxIndex.
 *          Each element is an object with the following fields:
 *          - `index`: The zero-based position in the protein sequence.
 *          - `sig`: The significance value based on log2 fold change if thresholds are met
 *          - `aminoacid`: The single-letter amino acid code at this position.
 *          - `detected`: 1 if the position was covered by a peptide but did not meet significance thresholds, otherwise null.
 *          - `score`: The normalized averaged score at this position, or null when there is no coverage
 */
export function processExperimentData(data, proteinSequence, scoreMethod = AMINO_ACID_SCORE_METHOD) {
  if (!data || data.length === 0) return [];

  // Match calculate_aa_scores.R:
  //   distinct(protein, diff, adj_pval, start_position, end_position)
  //   drop_na(diff, adj_pval)
  //   score = additive or multiplicative formula
  //   residue = seq(start_position, end_position)  # inclusive, 1-based biological positions
  //   amino_acid_score = mean(score) per residue
  //   amino_acid_score_normalized = min-max normalization per protein
  const seenRows = new Set();
  const residueScores = new Map();
  let maxResidue = 0;

  data.forEach(row => {
    if (row.diff === null || row.diff === undefined || row.adj_pval === null || row.adj_pval === undefined) {
      return;
    }

    const diff = Number(row.diff);
    const adjPval = Number(row.adj_pval);
    const start = Math.round(Number(row.pos_start));
    const end = Math.round(Number(row.pos_end));

    // R's drop_na removes missing/NaN diff and adj_pval values. Positions must also be usable.
    if (Number.isNaN(diff) || Number.isNaN(adjPval) || Number.isNaN(start) || Number.isNaN(end)) {
      return;
    }

    // Peptide positions are expected to be 1-based inclusive coordinates.
    if (start < 1 || end < start) {
      return;
    }

    const distinctKey = [row.pg_protein_accessions ?? '', diff, adjPval, start, end].join('|');
    if (seenRows.has(distinctKey)) {
      return;
    }
    seenRows.add(distinctKey);

    const score = calculateAminoAcidScore(diff, adjPval, scoreMethod);
    if (!Number.isFinite(score)) {
      return;
    }

    maxResidue = Math.max(maxResidue, end);

    // Inclusive end, equivalent to R's seq(start_position, end_position).
    for (let residue = start; residue <= end; residue++) {
      if (!residueScores.has(residue)) {
        residueScores.set(residue, []);
      }
      residueScores.get(residue).push(score);
    }
  });

  if (maxResidue === 0) return [];

  const aminoAcidScores = new Map();
  residueScores.forEach((scores, residue) => {
    const sum = scores.reduce((acc, score) => acc + score, 0);
    aminoAcidScores.set(residue, sum / scores.length);
  });

  const validScores = Array.from(aminoAcidScores.values());
  const min = validScores.length > 0 ? Math.min(...validScores) : 0;
  const max = validScores.length > 0 ? Math.max(...validScores) : 0;
  const isDegenerate = min === max;

  return Array.from({ length: maxResidue }, (_, arrayIndex) => {
    const residue = arrayIndex + 1;
    const aminoAcidScore = aminoAcidScores.get(residue) ?? null;
    const isCovered = aminoAcidScore !== null;
    const normalizedScore = isCovered
      ? (isDegenerate ? 1.0 : (aminoAcidScore - min) / (max - min))
      : null;

    return {
      index: residue,
      residue,
      sig: isCovered ? 1 : null,
      aminoacid: proteinSequence[residue - 1] || '',
      detected: isCovered ? 1 : null,
      amino_acid_score: aminoAcidScore,
      amino_acid_score_normalized: normalizedScore,
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
  
