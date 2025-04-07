
import db from '../config/database.js';

export const getUniprotData = async (accession) => {
  const url = `https://www.ebi.ac.uk/proteins/api/features/${accession}`;
  const response = await fetch(url);
  return response.json();
};

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

export const getProteinDataByName = async(proteinName) => {
try {
  const query = `SELECT seq, protein_name, protein_description FROM organism_proteome_entries WHERE protein_name LIKE ?`;
  const [rows] = await db.query(query, [`%${proteinName}%`]);
  return rows;
} catch (error) {
  throw error; 
}
};


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
        83333: "Escherichia coli"
    };
    
    return taxonomyDict[taxId] || "Taxonomy ID not found";
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
        ON da.pg_protein_accessions = ope.protein_name
        WHERE da.dpx_comparison = ? AND da.adj_pval > 0
    `;
    const [rows] = await db.query(query, [experimentID]);
    return rows;
  } catch (error) { 
      console.error('Error in getDifferentialAbundanceByExperimentID:', error);
      throw error;
  }
};

export const getDifferentialAbundanceByExperimentIDs = async (experimentIDs) => {
  if (experimentIDs.length > 0) {  
    try {
      const placeholders = experimentIDs.map(() => '?').join(',');
      const query = `
          SELECT da.pg_protein_accessions, da.pep_grouping_key, da.diff, da.adj_pval, da.dpx_comparison
          FROM differential_abundance da
          JOIN organism_proteome_entries ope 
          ON da.pg_protein_accessions = SUBSTRING_INDEX(SUBSTRING_INDEX(ope.protein_name, '|', 2), '|', -1)
          WHERE da.dpx_comparison IN (${placeholders}) AND da.adj_pval > 0
      `;
      const [rows] = await db.query(query, experimentIDs);
      return rows;
    } catch (error) { 
        console.error('Error in getDifferentialAbundanceByExperimentIDs:', error);
        throw error;
    }
  } else {
    console.log("No experiment IDs provided");
    return [];  
  }
};


export const getGoEnrichmentResultsByExperimentIDs = async (experimentIDs) => {
  try {
    // Early return if the experimentIDs array is empty
    if (!Array.isArray(experimentIDs) || experimentIDs.length === 0) {
      console.warn('No experiment IDs provided for GO enrichment.');
      return []; // Return an empty array to indicate no results
    }

    // Generate placeholders for the SQL query based on the number of experiment IDs
    const placeholders = experimentIDs.map(() => '?').join(',');

    // Construct the query using the placeholders
    const query = `
        SELECT 
            gt.go_term,
            ga.adj_pval,
            ga.dpx_comparison,
            GROUP_CONCAT(DISTINCT gt.accessions ORDER BY gt.accessions ASC) AS accessions
        FROM 
            go_analysis ga
        LEFT JOIN 
            go_term gt ON ga.go_id = gt.go_id
        INNER JOIN 
            dynaprot_experiment_comparison le ON ga.dpx_comparison = le.dpx_comparison
        WHERE 
            ga.dpx_comparison IN (${placeholders})  
        GROUP BY 
            gt.go_term, ga.adj_pval, ga.dpx_comparison;
    `;

    // Execute the query with the array of experiment IDs
    const [rows] = await db.query(query, experimentIDs);
    return rows;
  } catch (error) {
    console.error('Error in getGoEnrichmentResultsByExperimentIDs:', error);
    throw error;
  }
};



export const getGoEnrichmentResultsByExperimentID = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT 
            gt.term,
            ga.adj_pval,
            ga.dpx_comparison,
            gt.accessions
        FROM 
            go_analysis ga
        LEFT JOIN 
            go_term gt
        ON 
            ga.go_id = gt.go_id
        INNER JOIN 
            dynaprot_experiment_comparison le
        ON 
            ga.dpx_comparison = le.dpx_comparison
        WHERE 
            ga.dpx_comparison = ?
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
  const query = 'SELECT * FROM dynaprot_experiment';
  try {
      const [rows] = await db.query(query);
      return rows;
  } catch (error) {
      console.error('Error fetching all experiments:', error.message);
      throw error;
  }
};


export const getExperimentsByCondition = async (condition) => {
  try {
    const [rows] = await db.query(
      `
      SELECT dpx_comparison
      FROM dynaprot_experiment_comparison
      WHERE \`condition\` = ?
      `,
      [condition]
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
          SELECT * FROM dynaprot_experiment_comparison
          WHERE dynaprot_experiment = ?
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
          SELECT DISTINCT \`condition\` FROM dynaprot_experiment_comparison WHERE \`condition\` IS NOT NULL
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
          AND dpx_comparison = ?
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
        SELECT * FROM dynaprot_experiment_comparison
        WHERE dpx_comparison IN (${placeholders})
    `, experimentIDsList);

    return rows;
  } catch (error) {
    console.error('Error in getExperimentsMetaData:', error);
    throw error;
  }
};

export const fetchAllConditionData = async (condition) => {
  try {
    const [rows] = await db.query(`
        SELECT
            le.dpx_compariosn,
            le.condition,
            da.pg_protein_accessions,
            da.diff AS differential_abundance_value,
            da.pos_start,
            da.adj_pval AS differential_abundance_score,
            ps.cumulativeScore AS protein_score,
            GROUP_CONCAT(DISTINCT ge.go_id SEPARATOR ', ') AS go_ids,
            GROUP_CONCAT(DISTINCT ge.term SEPARATOR ', ') AS go_terms
        FROM
            dynaprot_experiment_comparison le
        JOIN
            differential_abundance da ON le.dpx_comparison = da.dpx_comparison
        LEFT JOIN
            go_analysis ge ON le.dpx_comparison = ge.dpx_comparison
        LEFT JOIN
            protein_scores ps ON da.pg_protein_accessions = ps.pg_protein_accessions AND le.dpx_comparison = ps.dpx_comparison
        WHERE
            le.condition = ?
        GROUP BY
            le.dpx_comparison, le.condition, da.pg_protein_accessions, da.diff, da.pos_start, da.adj_pval, ps.cumulativeScore
    `, [condition]);
    return rows;
  } catch (error) {
    console.error('Error in fetchAllConditonData', error);
    throw error;
  }
};




export const getExperimentMetaData = async (experimentID) => {
  try {
    const [rows] = await db.query(`
        SELECT * FROM dynaprot_experiment_comparison
        WHERE dpx_comparison = ?
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
        WHERE dpx_comparison = ?
    `, [experimentID]);
    return rows;
} catch (error) {
    console.error('Error in get getProteinScoreforSingleExperiment:', error);
    throw error;
}
};

export const getProteinScoresForMultipleExperiments = async (experimentIDs) => {
  try {
    // Early return if the experimentIDs array is empty
    if (!Array.isArray(experimentIDs) || experimentIDs.length === 0) {
      console.warn('No experiment IDs provided for protein scores.');
      return []; // Return an empty array to indicate no results
    }

    // Generate placeholders for the SQL query based on the number of experiment IDs
    const placeholders = experimentIDs.map(() => '?').join(',');

    // Modify the query to use the `IN` clause for multiple IDs and join with organism_proteome_entries
    const query = `
        SELECT ps.pg_protein_accessions, ps.cumulativeScore, ps.dpx_comparison, op.protein_description
        FROM protein_scores ps
        JOIN organism_proteome_entries op ON ps.pg_protein_accessions = op.protein_name
        WHERE ps.dpx_comparison IN (${placeholders})
    `;

    // Execute the query with the array of experiment IDs
    const [rows] = await db.query(query, experimentIDs);
    return rows;
  } catch (error) {
    console.error('Error in getProteinScoresForMultipleExperiments:', error);
    throw error;
  }
};