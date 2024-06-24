import db from '../config/database.js';
import fetch from 'node-fetch';

export const getUniprotData = async (accession) => {
    const url = `https://www.ebi.ac.uk/proteins/api/features/${accession}`;
    const response = await fetch(url);
    return response.json();
};

export const getBarcodesequence = async (data) => {
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
      return match[1]; // Returns the extracted accession part
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
    throw error; // Propagate the error
  }
};



export function prepareData(jsonData, proteinSequence) {
  /**
   * Prepare data for barcode visualitzation
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
  
  // Determine the required size for vectors based on the maximum "end" value in the data
  const maxIndex = Math.max(...jsonData.map(row => Math.round(row.pos_end)));
  const len_vector = new Array(maxIndex + 1).fill(0); // +1 because arrays are 0-indexed
  const len_vector_detected = new Array(maxIndex + 1).fill(0);
  const scores = new Array(maxIndex + 1).fill(null);

  // Constants for cutoff values
  const qvalue_cutoff = 0.05;
  const log2FC_cutoff = 0.2;

  // Process JSON data
  jsonData.forEach(row => {
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

  // Create output arrays
  const dataframe_with_vector = len_vector.map((value, index) => ({
      value: value !== 0 ? value : NaN,
      aminoacid: index < proteinSequence.length ? proteinSequence[index] : '?', // '?' as fallback if index exceeds protein sequence length
      score: scores[index]
  }));

  const dataframe_with_vector_detected = len_vector_detected.map((value, index) => ({
      value: (value === 1 && len_vector[index] === 0) ? 0 : NaN,
      aminoacid: index < proteinSequence.length ? proteinSequence[index] : '?'
  }));

  // Combine into an array of objects
  return dataframe_with_vector.map((item, index) => ({
      index: index,
      sig: isNaN(item.value) ? null : item.value,
      aminoacid: item.aminoacid,
      detected: isNaN(dataframe_with_vector_detected[index]) ? null : dataframe_with_vector_detected[index],
      score: item.score
  }));
}

export const getProteinStructure = async (proteinId) => {
  try {
    // List all files in the specified directory
    directory = "./temp_db/UP000002311_559292_YEAST_v4/"
    const files = await readdir(directory);
    
    // Find the first file that matches the protein ID and ends with '.pdb.gz'
    const targetFile = files.find(file => file.includes(proteinId) && file.endsWith('.pdb.gz'));
    
    if (!targetFile) {
        throw new Error(`No file found for protein ID: ${proteinId}`);
    }

    // Construct the full path to the file
    const filePath = path.join(directory, targetFile);
    
    // Read and unzip the file contents
    const compressedData = await readFile(filePath);
    const decompressedData = await gunzip(compressedData);

    // Convert buffer to string (assuming UTF-8 encoding)
    return decompressedData.toString('utf-8');
} catch (error) {
    console.error('Error:', error.message);
    return null;
}
}

export const searchProtein = async(searchTerm) => {
  

}


export const getProteinFeatures = async(taxonomyID, proteinName) => {
  try {
    const fastaEntries = await findProteinByOrganismAndName(taxonomyID, proteinName);
    if (fastaEntries.length === 0) {
      throw new Error("No protein found for the given taxonomy ID and protein name.");
    }
    const fastaEntry = fastaEntries[0];

    const pgProteinAccession = extractProteinAccession(fastaEntry.protein_name); 
    const differentialAbundance = await getDifferentialAbundanceByAccession(pgProteinAccession);
    const differentialAbundanceData = prepareData(differentialAbundance, fastaEntry.seq);
    const proteinStructure = getProteinStructure(pgProteinAccession);

    const result = {
      proteinName: pgProteinAccession,
      proteinSequence: fastaEntry.seq,
      differentialAbundanceData: differentialAbundanceData,
      //proteinStructure: proteinStructure
    };
    return result;
  } catch (error) {
    console.error("Error in getProteinFeatures:", error.message);
    throw error; // Rethrow the error to be handled by the caller
  }
};
  