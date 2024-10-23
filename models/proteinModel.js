import db from '../config/database.js';
import fetch from 'node-fetch';
import { median } from 'mathjs'; 

export const getUniprotData = async (accession) => {
    const url = `https://www.ebi.ac.uk/proteins/api/features/${accession}`;
    const response = await fetch(url);
    return response.json();
};

export const getBarcodesequence = async (jsonData) => {
  /**
   * Generate barcode sequences for each experimentID
   * 
   * @param {Array} jsonData - The JSON data containing experiment data.
   * 
   * @returns {Object} An object where each key is an experimentID and the value is the barcode sequence string.
   */
  
  // Helper function to generate barcode sequence for a single experiment
  const generateBarcode = (data) => {
    let result = "";

    for (let d of data) {
      let character;

      if (d.sig !== null && d.sig !== 0) {
        character = 'S';
      } else if (d.detected !== null && d.detected !== 0) {
        character = 'D';
      } else {
        character = 'I';
      }

      result += character;
    }
    return result;
  }

  // Split data by experimentID
  const experiments = jsonData.reduce((acc, row) => {
    if (!acc[row.lipexperiment_id]) {
      acc[row.lipexperiment_id] = [];
    }
    acc[row.lipexperiment_id].push(row);
    return acc;
  }, {});

  // Process each experiment's data and generate barcode sequence
  const barcodes = Object.keys(experiments).reduce((acc, lipexperiment_id) => {
    acc[lipexperiment_id] = generateBarcode(experiments[lipexperiment_id]);
    return acc;
  }, {});

  return barcodes;
}


export const getDifferentialAbundanceByAccession = async (pgProteinAccessions) => {
  try {
      const [rows] = await db.query(`
          SELECT * FROM differential_abundance
          WHERE pg_protein_accessions = ?
          ORDER BY pos_start
      `, [pgProteinAccessions]);
      return rows;
  } catch (error) {
      console.error('Error in getDifferentialAbundanceByAccession:', error);
      throw error;
  }
};

export const extractProteinAccession = (proteinName) => {
  const match = proteinName.match(/^[^|]*\|([^|]+)\|/);
  if (match) {
      return match[1]; 
  } else {
      throw new Error(`Protein name "${proteinName}" does not match the expected format.`);
  }
};

export const findProteinByOrganismAndName = async(taxonomyID, proteinName) => {
  try {
    const query = `SELECT seq, protein_name, protein_description FROM organism_proteome_entries WHERE taxonomy_id = ? AND protein_name LIKE ?`;
    const [rows] = await db.query(query, [taxonomyID, `%${proteinName}%`]);
    return rows;
  } catch (error) {
    throw error; 
  }
};

export const getProteinByName = async(proteinName) => {
  try {
    const query = `SELECT seq, protein_name, protein_description FROM organism_proteome_entries WHERE protein_name LIKE ?`;
    const [rows] = await db.query(query, [`%${proteinName}%`]);
    return rows;
  } catch (error) {
    throw error; 
  }
};



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

  const generateBarcode = (data) => {
    let result = "";

    for (let d of data) {
      let character;

      if (d.sig !== null && d.sig !== 0) {
        character = 'S';
      } else if (d.detected !== null && d.detected !== 0) {
        character = 'D';
      } else {
        character = 'I';
      }

      result += character;
    }
    return result;
  }

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
    if (!acc[row.lipexperiment_id]) {
      acc[row.lipexperiment_id] = [];
    }
    acc[row.lipexperiment_id].push(row);
    return acc;
  }, {});

  // Process each experiment's data
  const processedData = Object.keys(experiments).reduce((acc, lipexperiment_id) => {
    acc[lipexperiment_id] = processExperimentData(experiments[lipexperiment_id]);
    return acc;
  }, {});

  const barcodes = Object.keys(processedData).reduce((acc, lipexperiment_id) => {
    acc[lipexperiment_id] = generateBarcode(processedData[lipexperiment_id]);
    return acc;
  }, {});

  return {processedData, barcodes};
}


export const extractProteinDescription = (inputString) => {
  const regex = /^[^\s]+\s+(.*?)\s+OS=/;
  const match = inputString.match(regex);
  return match ? match[1] : "Description not found";
};

export const getProteinFeatures = async(proteinName) => {
  try {
    const fastaEntries = await getProteinByName(proteinName);
    if (fastaEntries.length === 0) {
      throw new Error("No protein found for the given taxonomy ID and protein name.");
    }
    const fastaEntry = fastaEntries[0];

    const pgProteinAccession = extractProteinAccession(fastaEntry.protein_name); 
    const differentialAbundance = await getDifferentialAbundanceByAccession(pgProteinAccession);
    const {processedData, barcodes } = prepareData(differentialAbundance, fastaEntry.seq);
    const proteinDescription = extractProteinDescription(fastaEntry.protein_description);
  
    const result = {
      proteinName: pgProteinAccession,
      proteinSequence: fastaEntry.seq,
      differentialAbundanceData: processedData,
      differentialAbundanceDataMedian: processedData,
      barcodeSequence: barcodes,
      proteinDescription: proteinDescription
    };
    
    return result;
  } catch (error) {
    console.error("Error in getProteinFeatures:", error.message);
    throw error;
  }
};
  