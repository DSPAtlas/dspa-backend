
import db from '../config/database.js';

export const findProteinBySearchTerm = async (searchTerm) => {
    try {
      const query = `
        SELECT seq, protein_name, protein_description, taxonomy_id 
        FROM organism_proteome_entries 
        WHERE protein_name LIKE ? OR protein_description LIKE ?
      `;

      const params = [`%${searchTerm}%`, `%${searchTerm}%`];
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error("Error in findProteinBySearchTerm:", error);
      throw error; 
    }
  };

export const getTaxonomyName = (taxId) => {
    const taxonomyDict = {
        10090: "Mus musculus",
        559292: "Saccharomyces cerevisiae S288C",
        9606: "Homo sapiens"
    };
    
    return taxonomyDict[taxId] || "Taxonomy ID not found";
};

export const extractProteinDescription = (inputString) => {
  const regex = /^[^\s]+\s+(.*?)\s+OS=/;
  const match = inputString.match(regex);
  return match ? match[1] : "Description not found";
};

export const extractProteinAccession = (proteinName) => {
  if (typeof proteinName !== 'string') {
      throw new TypeError(`Expected a string but received ${typeof proteinName}`);
  }
  const match = proteinName.match(/^[^|]*\|([^|]+)\|/);
  if (match) {
      return match[1]; 
  } else {
      console.log("No match found. Regex did not match the protein name."); 
      throw new Error(`Protein name "${proteinName}" does not match the expected format.`);
  }
};

export const getDifferentialAbundanceByExperimentID = async (experimentID) => {
  try {
    const query = `
        SELECT da.*, ope.seq,
        TRIM(SUBSTRING(
                ope.protein_description, 
                LOCATE('|', ope.protein_description, LOCATE('|', ope.protein_description) + 1) + 1,
                LOCATE('OS=', ope.protein_description) - LOCATE('|', ope.protein_description, LOCATE('|', ope.protein_description) + 1) - 2
        )) AS protein_description
        FROM differential_abundance da
        JOIN organism_proteome_entries ope 
        ON da.pg_protein_accessions = SUBSTRING_INDEX(SUBSTRING_INDEX(ope.protein_name, '|', 2), '|', -1)
        WHERE da.lipexperiment_id = ?
    `;
    const [rows] = await db.query(query, [experimentID]);
    return rows;
  } catch (error) { 
      console.error('Error in getDifferentialAbundanceByExperimentID:', error);
      throw error;
  }
};

export const getExperimentMetaData = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT * FROM lip_experiments
        WHERE lipexperiment_id = ?
    `, [experimentID]);
    return rows;
} catch (error) {
    console.error('Error in get getExperimentMetaData:', error);
    throw error;
}
};


export const getGoEnrichmentResultsByExperimentID = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT * FROM go_analysis
        WHERE lipexperiment_id = ?
    `, [experimentID]);
    return rows;
} catch (error) {
    console.error('Error in get getGoEnrichmentResultsByExperimentID(experimentID):', error);
    throw error;
}
};


export const getAllExperiments = async () => {
  const query = 'SELECT * FROM lip_experiments';
  try {
      const [rows] = await db.query(query);
      return rows;
  } catch (error) {
      console.error('Error fetching all experiments:', error.message);
      throw error;
  }
};

export const getAssociatedExperimentIDs = async (groupID) => {
  try {
      const [rows] = await db.query(`
          SELECT * FROM lip_experiments
          WHERE group_id = ?
      `, [groupID]);
      return rows;
  } catch (error) {
      console.error('Error fetching associated experiment IDs:', error.message);
      throw error;
  }
};

export const getDifferentialAbundanceByAccessionGroup = async (pgProteinAccessions, groupID) => {
  try {
      const [rows] = await db.query(`
          SELECT * FROM differential_abundance
          WHERE pg_protein_accessions = ?
          AND lipexperiment_id = ?
          ORDER BY pos_start
      `, [pgProteinAccessions, groupID]);
      return rows;
  } catch (error) {
      console.error('Error in getDifferentialAbundanceByAccession:', error);
      throw error;
  }
};