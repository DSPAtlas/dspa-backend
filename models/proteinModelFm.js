import {
  getDifferentialAbundanceByAccession,
  getProteinDataByName,
  extractProteinAccession
} from './searchModelFm.js';

const AMINO_ACID_SCORE_METHOD = 'additive';

const calculateAminoAcidScore = (diff, adjPval, method = AMINO_ACID_SCORE_METHOD) => {
  if (method === 'multiplicative') {
    return -Math.log10(adjPval) * Math.abs(diff);
  }

  if (method === 'additive') {
    return -Math.log10(adjPval) + Math.abs(diff);
  }

  throw new Error(`Unsupported amino acid score method: ${method}`);
};

const processExperimentData = (data, proteinSequence, scoreMethod = AMINO_ACID_SCORE_METHOD) => {
  if (!data || data.length === 0) return [];

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

    if (Number.isNaN(diff) || Number.isNaN(adjPval) || Number.isNaN(start) || Number.isNaN(end)) {
      return;
    }

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
};

const prepareData = (jsonData, proteinSequence) => {
  const experiments = jsonData.reduce((acc, row) => {
    if (!acc[row.dpx_comparison]) {
      acc[row.dpx_comparison] = [];
    }
    acc[row.dpx_comparison].push(row);
    return acc;
  }, {});

  const processedData = Object.keys(experiments).reduce((acc, dpx_comparison) => {
    acc[dpx_comparison] = processExperimentData(experiments[dpx_comparison], proteinSequence);
    return acc;
  }, {});

  return {processedData};
};

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

    return {
      proteinName: pgProteinAccession,
      proteinSequence: fastaEntry.seq,
      differentialAbundanceData: processedData,
      proteinDescription: fastaEntry.protein_description
    };
  } catch (error) {
    console.error("Error in getProteinFeatures FM:", error.message);
    throw error;
  }
};
