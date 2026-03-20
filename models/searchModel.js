
import db from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UNIPROT_CACHE_DIR = process.env.UNIPROT_CACHE_DIR || path.resolve(process.cwd(), '.cache', 'dspatlas');
const UNIPROT_CACHE_INDEX_FILE = path.join(UNIPROT_CACHE_DIR, 'index.json');
const UNIPROT_CACHE_MAX_BYTES = Number(process.env.UNIPROT_CACHE_MAX_BYTES || (64 * 1024 * 1024));
const UNIPROT_CACHE_TTL_MS = Number(process.env.UNIPROT_CACHE_TTL_MS || (30 * 24 * 60 * 60 * 1000));

let cacheInitPromise = null;

const createEmptyIndex = () => ({
  totalBytes: 0,
  entries: {}
});

const ensureCacheInitialized = async () => {
  if (cacheInitPromise) {
    return cacheInitPromise;
  }

  cacheInitPromise = (async () => {
    await fs.mkdir(UNIPROT_CACHE_DIR, { recursive: true });
    try {
      await fs.access(UNIPROT_CACHE_INDEX_FILE);
    } catch {
      await fs.writeFile(UNIPROT_CACHE_INDEX_FILE, JSON.stringify(createEmptyIndex()));
    }
  })();

  return cacheInitPromise;
};

const normalizeAccession = (accession) => String(accession || '').trim().toUpperCase();

const getCacheEntryFilename = (key) => {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return `${hash}.json`;
};

const readCacheIndex = async () => {
  await ensureCacheInitialized();

  try {
    const raw = await fs.readFile(UNIPROT_CACHE_INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      totalBytes: Number(parsed.totalBytes) || 0,
      entries: parsed.entries || {}
    };
  } catch {
    return createEmptyIndex();
  }
};

const writeCacheIndex = async (index) => {
  await fs.writeFile(UNIPROT_CACHE_INDEX_FILE, JSON.stringify(index));
};

const evictLruEntries = async (index) => {
  while (index.totalBytes > UNIPROT_CACHE_MAX_BYTES) {
    const candidates = Object.entries(index.entries);
    if (candidates.length === 0) {
      break;
    }

    const [oldestKey, oldestMeta] = candidates.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)[0];

    try {
      await fs.unlink(path.join(UNIPROT_CACHE_DIR, oldestMeta.file));
    } catch {
      // Keep eviction resilient when file is missing.
    }

    index.totalBytes -= oldestMeta.size || 0;
    delete index.entries[oldestKey];
  }

  if (index.totalBytes < 0) {
    index.totalBytes = 0;
  }
};

const getCachedUniprotResponse = async (cacheKey) => {
  const index = await readCacheIndex();
  const entryMeta = index.entries[cacheKey];

  if (!entryMeta) {
    return null;
  }

  const isExpired = (Date.now() - entryMeta.storedAt) > UNIPROT_CACHE_TTL_MS;

  if (isExpired) {
    try {
      await fs.unlink(path.join(UNIPROT_CACHE_DIR, entryMeta.file));
    } catch {
      // Ignore missing files during cleanup.
    }
    index.totalBytes -= entryMeta.size || 0;
    delete index.entries[cacheKey];
    await writeCacheIndex(index);
    return null;
  }

  try {
    const raw = await fs.readFile(path.join(UNIPROT_CACHE_DIR, entryMeta.file), 'utf8');
    entryMeta.lastAccessed = Date.now();
    index.entries[cacheKey] = entryMeta;
    await writeCacheIndex(index);
    return JSON.parse(raw);
  } catch {
    index.totalBytes -= entryMeta.size || 0;
    delete index.entries[cacheKey];
    await writeCacheIndex(index);
    return null;
  }
};

const setCachedUniprotResponse = async (cacheKey, data) => {
  const index = await readCacheIndex();
  const serialized = JSON.stringify(data);
  const size = Buffer.byteLength(serialized, 'utf8');
  const file = getCacheEntryFilename(cacheKey);
  const filePath = path.join(UNIPROT_CACHE_DIR, file);

  const existing = index.entries[cacheKey];
  if (existing) {
    index.totalBytes -= existing.size || 0;
  }

  await fs.writeFile(filePath, serialized);

  index.entries[cacheKey] = {
    file,
    size,
    storedAt: Date.now(),
    lastAccessed: Date.now()
  };
  index.totalBytes += size;

  await evictLruEntries(index);
  await writeCacheIndex(index);
};

export const getUniprotData = async (accession) => {
  const normalizedAccession = normalizeAccession(accession);
  const cacheKey = `uniprot:${normalizedAccession}`;
  const cached = await getCachedUniprotResponse(cacheKey);

  if (cached) {
    return cached;
  }

  const url = `https://www.ebi.ac.uk/proteins/api/features/${normalizedAccession}`;
  const response = await fetch(url);
  const responseData = await response.json();

  try {
    await setCachedUniprotResponse(cacheKey, responseData);
  } catch (error) {
    console.warn('[searchModel] Failed to write UniProt cache entry:', error.message);
  }

  return responseData;
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

export async function getDoseResponseExperiments(experimentIDsList) {
  if (!Array.isArray(experimentIDsList) || experimentIDsList.length === 0) return [];

  const placeholders = experimentIDsList.map(() => '?').join(',');
  const query = `
    SELECT DISTINCT dynaprot_experiment
    FROM dose_response_plot_curve
    WHERE dynaprot_experiment IN (${placeholders})
  `;

  const [rows] = await db.query(query, experimentIDsList);

  return rows.map(row => row.dynaprot_experiment);
}


export const findProteinBySearchTerm = async (searchTerm) => {
    try {
      const searchTermWildcard = `%${searchTerm}%`;

      const [rows] = await db.query(
        `SELECT DISTINCT o.seq, o.protein_name, o.protein_description, o.taxonomy_id, o.gene_name
        FROM organism_proteome_entries o
        JOIN differential_abundance d
        ON o.protein_name = d.pg_protein_accessions
        WHERE o.protein_name LIKE ? OR o.protein_description LIKE ? OR o.gene_name LIKE ?`,
        [searchTermWildcard, searchTermWildcard, searchTermWildcard]
      );

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

      // We also need two indices
      // ALTER TABLE `differential_abundance` ADD INDEX `idx_pg_protein_accessions` (`pg_protein_accessions`);
      // ALTER TABLE `organism_proteome_entries` ADD INDEX `idx_protein_name` (`protein_name`);

      const query = `
          SELECT da.pg_protein_accessions, da.pep_grouping_key, da.diff, da.adj_pval, da.dpx_comparison
          FROM differential_abundance da
          JOIN organism_proteome_entries ope 
          ON da.pg_protein_accessions = ope.protein_name
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

export const getDifferentialAbundanceByDynaProtExperiment = async (dynaprot_experiment) => {
  try {
    const query = `
      SELECT 
        dac.pg_protein_accessions,
        dac.pep_grouping_key,
        dac.diff,
        dac.adj_pval,
        dac.dpx_comparison
      FROM 
        dynaprot_experiment de
      JOIN 
        dynaprot_experiment_comparison \`dec\` 
          ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
      JOIN 
        differential_abundance dac 
          ON \`dec\`.dpx_comparison = dac.dpx_comparison
      WHERE 
        de.dynaprot_experiment = ?
        AND dac.adj_pval > 0;
    `;
    const [rows] = await db.query(query, [dynaprot_experiment]);
    return rows;
  } catch (error) { 
    console.error('Error in getDifferentialAbundanceByDynaProtExperiment:', error);
    throw error;
  }
};

export const getGoEnrichmentResultsByDynaProtExperiment = async (dynaprot_experiment) => {
  try {
    const query = `
      SELECT 
        gt.go_term,
        ga.adj_pval,
        ga.dpx_comparison,
        gt.accessions
      FROM 
        dynaprot_experiment de
      JOIN 
        dynaprot_experiment_comparison \`dec\` 
          ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
      JOIN 
        go_analysis ga 
          ON \`dec\`.dpx_comparison = ga.dpx_comparison
      LEFT JOIN 
        go_term gt 
          ON ga.go_id = gt.go_id
      WHERE 
        de.dynaprot_experiment = ?
        AND gt.taxonomy_id = \`dec\`.taxonomy_id
        AND ga.adj_pval < 1
    `;
    const [rows] = await db.query(query, [dynaprot_experiment]);
    return rows;
  } catch (error) {
    console.error('Error in getGoEnrichmentResultsByDynaProtExperiment:', error);
    throw error;
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



export const getGoEnrichmentResultsByExperimentID = async (dynaprot_experiment) => {
  try {
    const [rows] = await db.query(`
        SELECT 
            gt.go_term,
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
    `, [dynaprot_experiment]);
    return rows;
} catch (error) {
    console.error('Error in get getGoEnrichmentResultsByExperimentID(experimentID):', error);
    throw error;
}
};


// This query is for experiments overview page. There are much more columns in the table.
export const getAllExperiments = async () => {
  const query = `
    SELECT
      de.dynaprot_experiment,
      de.perturbation,
      de.condition,
      de.protease,
      de.doi,
      o.organism_name AS organism
    FROM dynaprot_experiment de
    LEFT JOIN organism o
      ON o.taxonomy_id = de.taxonomy_id
  `;
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
    let query = `
      SELECT dpx_comparison
      FROM dynaprot_experiment_comparison
      WHERE \`condition\` = ?
    `;
    const params = [condition.condition];

    if (condition.taxonomyId !== null && condition.taxonomyId !== undefined) {
      query += ` AND taxonomy_id = ?`;
      params.push(condition.taxonomyId);
    }

    const [rows] = await db.query(query, params);
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
          SELECT DISTINCT
              comparison.\`condition\`,
              comparison.taxonomy_id,
              o.organism_name
          FROM dynaprot_experiment_comparison comparison
          LEFT JOIN organism o ON o.taxonomy_id = comparison.taxonomy_id
          WHERE comparison.\`condition\` IS NOT NULL
          ORDER BY comparison.\`condition\`, comparison.taxonomy_id
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

export const getDistinctDoseByExperimentComparisonIDs = async (experimentComparisonIDsList) => {
  try {
    if (!Array.isArray(experimentComparisonIDsList) || experimentComparisonIDsList.length === 0) {
      return [];
    }

    const placeholders = experimentComparisonIDsList.map(() => '?').join(', ');

    // Use an aggregate to guarantee a single row per comparison id even if the table
    // accidentally contains duplicates.
    // NOTE: `dose` is VARCHAR, so `MIN(dose)` picks the lexicographically smallest string
    // (collation-dependent). We don't interpret it as a numeric minimum here; it's only a
    // deterministic tie-breaker to collapse duplicates.
    const [rows] = await db.query(
      `
        SELECT dpx_comparison, MIN(dose) AS dose
        FROM dynaprot_experiment_comparison
        WHERE dpx_comparison IN (${placeholders})
        GROUP BY dpx_comparison
      `,
      experimentComparisonIDsList
    );

    return rows;
  } catch (error) {
    console.error('Error in getDistinctDoseByExperimentComparisonIDs:', error);
    throw error;
  }
};

export const fetchAllConditionData = async (condition) => {
  try {
    const [rows] = await db.query(`
        SELECT
            le.dpx_comparison,
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

export const getDynaProtExperimentMetaData = async (dynaprot_experiment, { includeQcPdf = false } = {}) => {
  try {
    const qcPdfField = includeQcPdf ? ', qc_pdf_file' : '';
    const [rows] = await db.query(`
        SELECT dynaprot_experiment, \`condition\`, taxonomy_id, strain, publication, instrument, experiment, approach, digestion_protocol, protease, pk_digestion_time_in_sec${qcPdfField}
        FROM dynaprot_experiment
        WHERE dynaprot_experiment = ?
    `, [dynaprot_experiment]);
    return rows;
} catch (error) {
    console.error('Error in get  getDynaProtExperimentMetaData:', error);
    throw error;
}
};

export const getSummarizedProteinScoreByDynaProtExperiment = async (dynaprot_experiment) => {
  try {
    const query = `
      SELECT 
        ps.pg_protein_accessions,
        ope.protein_description,  -- from organism_proteome_entries
        SUM(ps.cumulativeScore) AS total_cumulative_score
      FROM 
        dynaprot_experiment de
      JOIN 
        dynaprot_experiment_comparison \`dec\`
        ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
      JOIN 
        protein_scores ps
        ON \`dec\`.dpx_comparison = ps.dpx_comparison
      LEFT JOIN 
        organism_proteome_entries ope
        ON ps.pg_protein_accessions = ope.protein_name
        AND \`dec\`.taxonomy_id = ope.taxonomy_id  -- ensure matching species
      WHERE 
        de.dynaprot_experiment = ?
      GROUP BY 
        ps.pg_protein_accessions, ope.protein_description
      ORDER BY 
        total_cumulative_score DESC
    `;
    const [rows] = await db.query(query, [dynaprot_experiment]);
    return rows;
  } catch (error) {
    console.error('Error in getSummarizedProteinScoreByDynaProtExperiment:', error);
    throw error;
  }
};

export const getTopChangingPeptidesByDynaProtExperiment = async (dynaprot_experiment) => {
  try {
    const query = `
      SELECT
        da.pg_protein_accessions,
        da.pep_grouping_key AS peptide_key,
        da.diff,
        da.adj_pval,
        da.dpx_comparison
      FROM dynaprot_experiment de
      JOIN dynaprot_experiment_comparison \`dec\`
        ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
      JOIN differential_abundance da
        ON \`dec\`.dpx_comparison = da.dpx_comparison
      WHERE de.dynaprot_experiment = ?
        AND da.adj_pval < 0.05
        AND ABS(da.diff) > 1
      ORDER BY ABS(da.diff) DESC
      LIMIT 20
    `;
    const [rows] = await db.query(query, [dynaprot_experiment]);
    return rows;
  } catch (error) {
    console.error('Error in getTopChangingPeptidesByDynaProtExperiment:', error);
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

    const placeholders = experimentIDs.map(() => '?').join(',');

    const query = `
        SELECT ps.pg_protein_accessions, ps.cumulativeScore, ps.dpx_comparison, op.protein_description
        FROM protein_scores ps
        JOIN organism_proteome_entries op ON ps.pg_protein_accessions = op.protein_name
        WHERE ps.dpx_comparison IN (${placeholders})
    `;

    const [rows] = await db.query(query, experimentIDs);
    return rows;
  } catch (error) {
    console.error('Error in getProteinScoresForMultipleExperiments:', error);
    throw error;
  }
};

export const getDoseResponseDatabyExperiments = async (experimentIDs, proteinAccession) => {
  try {
    const dynaprot_experiments = [...new Set(
      experimentIDs
        .filter(id => typeof id === 'string' && id.includes('-')) 
        .map(id => id.split('-')[0]) 
    )];

    if (dynaprot_experiments.length === 0) return []; 

    const placeholders = dynaprot_experiments.map(() => '?').join(',');

    const query = `
       SELECT * 
       FROM dose_response_fit
       WHERE dynaprot_experiment IN (${placeholders}) AND pg_protein_accessions = ?
    `;
    const [rows] = await db.query(query, [...dynaprot_experiments, proteinAccession]);
    return rows || [];
  } catch (error) {
    console.error('Error in getDoseResponseDatabyExperiments:', error.message);
    return []; 
  }
};

export const getDoseResponseDataByProtein = async (dynaprotExperiment, proteinAccession) => {
  try {
    // Step 1: Get peptides (pep_grouping_key) associated with the protein accession
    const pepKeyQuery = `
      SELECT pep_grouping_key
      FROM dose_response_fit
      WHERE dynaprot_experiment = ? 
        AND pg_protein_accessions = ?;
    `;

    const [pepKeyRows] = await db.query(pepKeyQuery, [dynaprotExperiment, proteinAccession.trim()]);;
   
    const pepKeys = pepKeyRows.map(row => row.pep_grouping_key);
    if (pepKeys.length === 0) {
      return { doseResponseDataPlotCurve: [], doseResponseDataPlotPoints: [] };
    }
    

    // Step 2: Generate placeholders
    const placeholders = pepKeys.map(() => '?').join(', ');

    // Step 3: Fetch curve data
    const curveQuery = `
      SELECT dynaprot_experiment, pep_grouping_key, dose, prediction, lower, upper
      FROM dose_response_plot_curve
      WHERE dynaprot_experiment = ?
        AND pep_grouping_key IN (${placeholders});
    `;
    const [doseResponseDataPlotCurve] = await db.query(curveQuery, [dynaprotExperiment, ...pepKeys]);

    // Step 4: Fetch plot points
    const pointsQuery = `
      SELECT dynaprot_experiment, pep_grouping_key, normalised_intensity_log2, dose
      FROM dose_response_plot_points
      WHERE dynaprot_experiment = ?
        AND pep_grouping_key IN (${placeholders});
    `;
    const [doseResponseDataPlotPoints] = await db.query(pointsQuery, [dynaprotExperiment, ...pepKeys]);

    // Step 5: Return response
    return {
      doseResponseDataPlotCurve: doseResponseDataPlotCurve || [],
      doseResponseDataPlotPoints: doseResponseDataPlotPoints || []
    };
  } catch (error) {
    console.error('Error in getDoseResponseDataByProtein:', error.message);
    return { doseResponseDataPlotCurve: [], doseResponseDataPlotPoints: [] };
  }
};
