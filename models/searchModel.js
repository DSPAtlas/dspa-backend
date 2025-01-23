
import db from '../config/database.js';

export const findProteinBySearchTerm = async (searchTerm) => {
    try {
      const query = `
         SELECT DISTINCT o.seq, o.protein_name, o.protein_description, o.taxonomy_id 
          FROM organism_proteome_entries o
          JOIN differential_abundance d
          ON o.protein_name = d.pg_protein_accessions
          WHERE o.protein_name LIKE ? OR o.protein_description LIKE ?
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
        9606: "Homo sapiens",
        562: "Escherichia coli"
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

export const findProteinByName = async(proteinName) => {
  try {
    const query = `SELECT seq, protein_name, protein_description FROM organism_proteome_entries WHERE protein_name LIKE ?`;
    const [rows] = await db.query(query, [proteinName]);
    return rows;
  } catch (error) {
    throw error; 
  }
};

export const getDifferentialAbundanceByExperimentID = async (experimentID) => {
  try {
    const query = `
        SELECT da.pg_protein_accessions, da.pep_grouping_key, da.diff, da.adj_pval
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




export const getGoEnrichmentResultsByExperimentID = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT 
            ga.term,
            ga.adj_pval,
            ga.lipexperiment_id,
            gt.accessions
        FROM 
            go_analysis ga
        LEFT JOIN 
            go_term gt
        ON 
            ga.go_id = gt.go_id
        INNER JOIN 
            lip_experiments le
        ON 
            ga.lipexperiment_id = le.lipexperiment_id
        WHERE 
            ga.lipexperiment_id = ?
        AND 
            gt.taxonomy_id = le.taxonomy_id
        AND 
            ga.adj_pval < 1
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


export const getExperimentsByTreatment = async (treatment) => {
  try {
    const [rows] = await db.query(
      `
      SELECT lipexperiment_id 
      FROM lip_experiments 
      WHERE \`condition\` = ?
      `,
      [treatment]
    );
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

export const getConditions = async () => {
  try {
      const [rows] = await db.query(`
          SELECT DISTINCT \`condition\` FROM lip_experiments WHERE \`condition\` IS NOT NULL
      `);
      return rows;
  } catch (error) {
      console.error('Error fetching conditions:', error.message);
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

export const getExperimentsMetaData = async (experimentIDsList) => {
  try {
    // Generate placeholders for the number of experiment IDs
    const placeholders = experimentIDsList.map(() => '?').join(', ');

    const [rows] = await db.query(`
        SELECT * FROM lip_experiments
        WHERE lipexperiment_id IN (${placeholders})
    `, experimentIDsList);

    return rows;
  } catch (error) {
    console.error('Error in getExperimentsMetaData:', error);
    throw error;
  }
};

export const fetchAllTreatmentData = async (condition) => {
  try {
    const [rows] = await db.query(`
        SELECT
            le.lipexperiment_id,
            le.condition,
            da.pg_protein_accessions,
            da.diff AS differential_abundance_value,
            da.pos_start,
            da.adj_pval AS differential_abundance_score,
            ps.cumulativeScore AS protein_score,
            GROUP_CONCAT(DISTINCT ge.go_id SEPARATOR ', ') AS go_ids,
            GROUP_CONCAT(DISTINCT ge.term SEPARATOR ', ') AS go_terms
        FROM
            lip_experiments le
        JOIN
            differential_abundance da ON le.lipexperiment_id = da.lipexperiment_id
        LEFT JOIN
            go_analysis ge ON le.lipexperiment_id = ge.lipexperiment_id
        LEFT JOIN
            protein_scores ps ON da.pg_protein_accessions = ps.pg_protein_accessions AND le.lipexperiment_id = ps.lipexperiment_id
        WHERE
            le.condition = ?
        GROUP BY
            le.lipexperiment_id, le.condition, da.pg_protein_accessions, da.diff, da.pos_start, da.adj_pval, ps.cumulativeScore
    `, [condition]);
    return rows;
  } catch (error) {
    console.error('Error in fetchAllTreatmentData', error);
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


export const getProteinScoreforSingleExperiment = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT * FROM protein_scores
        WHERE lipexperiment_id = ?
    `, [experimentID]);
    return rows;
} catch (error) {
    console.error('Error in get getProteinScoreforSingleExperiment:', error);
    throw error;
}
};