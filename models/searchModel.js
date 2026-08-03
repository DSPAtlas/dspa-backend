import db from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as searchModelFm from './searchModelFm.js';

const UNIPROT_CACHE_DIR = process.env.UNIPROT_CACHE_DIR || path.resolve(process.cwd(), '.cache', 'dspatlas');
const UNIPROT_CACHE_INDEX_FILE = path.join(UNIPROT_CACHE_DIR, 'index.json');
const UNIPROT_CACHE_MAX_BYTES = Number(process.env.UNIPROT_CACHE_MAX_BYTES || (64 * 1024 * 1024));
const UNIPROT_CACHE_TTL_MS = Number(process.env.UNIPROT_CACHE_TTL_MS || (30 * 24 * 60 * 60 * 1000));
const USE_FLAT_MIRROR = process.env.DSPA_USE_FLAT_MIRROR === '1';

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
        await fs.mkdir(UNIPROT_CACHE_DIR, {recursive: true});
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
            SELECT da.differential_abundance_id,
                   da.dpx_comparison,
                   da.pg_protein_accessions,
                   da.pep_grouping_key,
                   da.pos_start,
                   da.pos_end,
                   da.diff,
                   da.adj_pval
            FROM differential_abundance AS da
                     INNER JOIN dynaprot_experiment_comparison AS dec
                                ON dec.dpx_comparison = da.dpx_comparison
                     INNER JOIN dynaprot_experiment AS de
                                ON de.dynaprot_experiment = dec.dynaprot_experiment
            WHERE da.pg_protein_accessions = ?
              AND dec.is_hidden = 0
              AND de.is_hidden = 0
            ORDER BY da.pos_start
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

export const getProteinDataByName = async (proteinName) => {
    try {
        const query = `SELECT seq, protein_name, protein_description
                       FROM organism_proteome_entries
                       WHERE protein_name LIKE ?`;
        const [rows] = await db.query(query, [`%${proteinName}%`]);
        return rows;
    } catch (error) {
        throw error;
    }
};


export const findProteinBySearchTerm = async (searchTerm) => {
    if (USE_FLAT_MIRROR) {
        return searchModelFm.findProteinBySearchTerm(searchTerm);
    }

    try {
        const searchTermWildcard = `%${searchTerm}%`;

        const [rows] = await db.query(
            `SELECT DISTINCT o.seq, o.protein_name, o.protein_description, o.taxonomy_id, o.gene_name
             FROM organism_proteome_entries o
             WHERE (o.protein_name LIKE ? OR o.protein_description LIKE ? OR o.gene_name LIKE ?)
               AND EXISTS (SELECT 1
                           FROM differential_abundance d
                           WHERE d.pg_protein_accessions = o.protein_name)`,
            [searchTermWildcard, searchTermWildcard, searchTermWildcard]
        );

        return rows;
    } catch (error) {
        console.error("Error in findProteinBySearchTerm:", error);
        throw error;
    }
};

export const getTaxonomyName = async (taxId) => {
    const [rows] = await db.query(
        `SELECT organism_name
         FROM organism
         WHERE taxonomy_id = ?
         LIMIT 1`,
        [taxId]
    );

    return rows[0]?.organism_name || "Taxonomy ID not found";
};

export const getDifferentialAbundanceByExperimentIDs = async (experimentIDs) => {
    if (experimentIDs.length > 0) {
        try {
            const placeholders = experimentIDs.map(() => '?').join(',');

            const query = `
                SELECT da.pg_protein_accessions, da.pep_grouping_key, da.diff, da.adj_pval, da.dpx_comparison
                FROM differential_abundance da
                WHERE da.dpx_comparison IN (${placeholders})
                  AND da.adj_pval > 0
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

export const getSignificantProteinsByExperimentIDs = async (experimentIDs) => {
    if (!Array.isArray(experimentIDs) || experimentIDs.length === 0) {
        return [];
    }

    if (USE_FLAT_MIRROR) {
        return searchModelFm.getSignificantProteinsByExperimentIDs(experimentIDs);
    }

    try {
        const placeholders = experimentIDs.map(() => '?').join(',');
        const query = `
            SELECT da.dpx_comparison,
                   da.pg_protein_accessions,
                   da.diff,
                   da.adj_pval,
                   COALESCE(
                           ope_exact.protein_description,
                           ope_any.protein_description,
                           NULLIF(ps.protein_description, 'Description not available')
                   ) AS protein_description
            FROM differential_abundance da
                     LEFT JOIN protein_scores ps
                               ON ps.dpx_comparison = da.dpx_comparison
                                   AND ps.pg_protein_accessions = da.pg_protein_accessions
                     LEFT JOIN dynaprot_experiment_comparison \`dec\`
                               ON \`dec\`.dpx_comparison = da.dpx_comparison
                     LEFT JOIN (SELECT protein_name, taxonomy_id, MAX(protein_description) AS protein_description
                                FROM organism_proteome_entries
                                GROUP BY protein_name, taxonomy_id) ope_exact
                               ON ope_exact.protein_name = da.pg_protein_accessions
                                   AND ope_exact.taxonomy_id = \`dec\`.taxonomy_id
                     LEFT JOIN (SELECT protein_name, MAX(protein_description) AS protein_description
                                FROM organism_proteome_entries
                                GROUP BY protein_name) ope_any
                               ON ope_any.protein_name = da.pg_protein_accessions
            WHERE da.dpx_comparison IN (${placeholders})
              AND da.adj_pval < 0.05
              AND (da.diff < -1 OR da.diff > 1)
            ORDER BY ABS(da.diff) DESC, da.adj_pval ASC, da.differential_abundance_id ASC
        `;

        const [rows] = await db.query(query, experimentIDs);
        const proteinMap = new Map();

        rows.forEach((row) => {
            const proteinAccession = row.pg_protein_accessions;

            if (!proteinAccession) {
                return;
            }

            const existingProtein = proteinMap.get(proteinAccession);

            if (!existingProtein) {
                proteinMap.set(proteinAccession, {
                    proteinAccession,
                    pg_protein_accessions: proteinAccession,
                    diff: row.diff,
                    maxLog2FC: row.diff,
                    n_peptides: 1,
                    protein_description: row.protein_description || null,
                    dpx_comparison: row.dpx_comparison,
                    adj_pval: row.adj_pval
                });
                return;
            }

            existingProtein.n_peptides += 1;

            if (!existingProtein.protein_description && row.protein_description) {
                existingProtein.protein_description = row.protein_description;
            }
        });

        return Array.from(proteinMap.values()).sort(
            (left, right) => Math.abs(right.maxLog2FC) - Math.abs(left.maxLog2FC)
        );
    } catch (error) {
        console.error('Error in getSignificantProteinsByExperimentIDs:', error);
        throw error;
    }
};

export const getDifferentialAbundanceByDynaProtExperiment = async (dynaprot_experiment) => {
    try {
        const query = `
            SELECT dac.pg_protein_accessions,
                   dac.pep_grouping_key,
                   dac.diff,
                   dac.adj_pval,
                   dac.dpx_comparison
            FROM dynaprot_experiment de
                     JOIN
                 dynaprot_experiment_comparison \`dec\`
                 ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
                     JOIN
                 differential_abundance dac
                 ON \`dec\`.dpx_comparison = dac.dpx_comparison
            WHERE de.dynaprot_experiment = ?
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
            SELECT gt.go_term,
                   ga.adj_pval,
                   ga.dpx_comparison,
                   gt.accessions
            FROM dynaprot_experiment de
                     JOIN
                 dynaprot_experiment_comparison \`dec\`
                 ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
                     JOIN
                 go_analysis ga
                 ON \`dec\`.dpx_comparison = ga.dpx_comparison
                     LEFT JOIN
                 go_term gt
                 ON ga.go_id = gt.go_id
            WHERE de.dynaprot_experiment = ?
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
            SELECT gt.go_term,
                   ga.adj_pval,
                   ga.dpx_comparison,
                   GROUP_CONCAT(DISTINCT gt.accessions ORDER BY gt.accessions ASC) AS accessions
            FROM go_analysis ga
                     LEFT JOIN
                 go_term gt ON ga.go_id = gt.go_id
                     INNER JOIN
                 dynaprot_experiment_comparison le ON ga.dpx_comparison = le.dpx_comparison
            WHERE ga.dpx_comparison IN (${placeholders})
            GROUP BY gt.go_term, ga.adj_pval, ga.dpx_comparison;
        `;

        // Execute the query with the array of experiment IDs
        const [rows] = await db.query(query, experimentIDs);
        return rows;
    } catch (error) {
        console.error('Error in getGoEnrichmentResultsByExperimentIDs:', error);
        throw error;
    }
};


// This query is for experiments overview page. There are much more columns in the table.
export const getAllExperiments = async () => {
    const query = `
        SELECT de.dynaprot_experiment,
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


export const getConditions = async () => {
    try {
        const [rows] = await db.query(`
            SELECT DISTINCT comparison.\`condition\`,
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

export const getExperimentsMetaData = async (experimentIDsList) => {
    try {
        // Generate placeholders for the number of experiment IDs
        const placeholders = experimentIDsList.map(() => '?').join(', ');

        const [rows] = await db.query(`
            SELECT dec.dpx_comparison,
                   dec.taxonomy_id,
                   dec.\`condition\`,
                   dec.dose,
                   dec.dynaprot_experiment
            FROM dynaprot_experiment_comparison AS dec
                     INNER JOIN dynaprot_experiment AS de
                                ON de.dynaprot_experiment = dec.dynaprot_experiment
            WHERE dec.dpx_comparison IN (${placeholders})
              AND dec.is_hidden = 0
              AND de.is_hidden = 0
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
                SELECT dpx_comparison,
                       MIN(NULLIF(TRIM(dose), '')) AS dose,
                       COALESCE(
                               MIN(NULLIF(TRIM(dose), '')),
                               dpx_comparison
                       )                           AS comparison_label
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

export const getDynaProtExperimentMetaData = async (dynaprot_experiment, {includeQcPdf = false} = {}) => {
    try {
        const qcPdfField = includeQcPdf ? ', qc_pdf_file' : '';
        const [rows] = await db.query(`
            SELECT dynaprot_experiment,
                   perturbation,
                   \`condition\`,
                   taxonomy_id,
                   strain,
                   publication,
                   instrument,
                   experiment,
                   approach,
                   digestion_protocol,
                   protease,
                   pk_digestion_time_in_sec${qcPdfField}
            FROM dynaprot_experiment
            WHERE dynaprot_experiment = ?
        `, [dynaprot_experiment]);
        return rows;
    } catch (error) {
        console.error('Error in get  getDynaProtExperimentMetaData:', error);
        throw error;
    }
};

export const getSignificantProteinsByDynaProtExperiment = async (dynaprot_experiment) => {
    if (USE_FLAT_MIRROR) {
        return searchModelFm.getSignificantProteinsByDynaProtExperiment(dynaprot_experiment);
    }

    const aggregationStart = process.hrtime.bigint();

    try {
        const query = `
            SELECT da.dpx_comparison,
                   da.pg_protein_accessions,
                   da.diff,
                   da.adj_pval,
                   ope.protein_description
            FROM dynaprot_experiment de
                     JOIN dynaprot_experiment_comparison \`dec\`
                          ON de.dynaprot_experiment = \`dec\`.dynaprot_experiment
                     JOIN differential_abundance da
                          ON \`dec\`.dpx_comparison = da.dpx_comparison
                     LEFT JOIN organism_proteome_entries ope
                               ON da.pg_protein_accessions = ope.protein_name
                                   AND \`dec\`.taxonomy_id = ope.taxonomy_id
            WHERE de.dynaprot_experiment = ?
              AND da.adj_pval < 0.05
              AND (da.diff < -1 OR da.diff > 1)
            ORDER BY ABS(da.diff) DESC, da.adj_pval ASC, da.differential_abundance_id ASC
        `;

        const queryStart = process.hrtime.bigint();
        const [rows] = await db.query(query, [dynaprot_experiment]);
        const queryTimeMs = Number(process.hrtime.bigint() - queryStart) / 1e6;

        const processingStart = process.hrtime.bigint();
        const proteinMap = new Map();

        rows.forEach((row) => {
            const proteinAccession = row.pg_protein_accessions;

            if (!proteinAccession) {
                return;
            }

            const existingProtein = proteinMap.get(proteinAccession);

            if (!existingProtein) {
                proteinMap.set(proteinAccession, {
                    proteinAccession,
                    pg_protein_accessions: proteinAccession,
                    diff: row.diff,
                    maxLog2FC: row.diff,
                    n_peptides: 1,
                    protein_description: row.protein_description || null,
                    dpx_comparison: row.dpx_comparison,
                    adj_pval: row.adj_pval
                });
                return;
            }

            existingProtein.n_peptides += 1;

            if (!existingProtein.protein_description && row.protein_description) {
                existingProtein.protein_description = row.protein_description;
            }
        });

        const aggregatedProteins = Array.from(proteinMap.values()).sort(
            (left, right) => Math.abs(right.maxLog2FC) - Math.abs(left.maxLog2FC)
        );

        const postProcessingTimeMs = Number(process.hrtime.bigint() - processingStart) / 1e6;
        const totalTimeMs = Number(process.hrtime.bigint() - aggregationStart) / 1e6;
        console.info(
            `[Performance] Significant protein aggregation for ${dynaprot_experiment}: database query ${queryTimeMs.toFixed(2)} ms, post processing ${postProcessingTimeMs.toFixed(2)} ms, total ${totalTimeMs.toFixed(2)} ms (${rows.length} significant peptides -> ${aggregatedProteins.length} proteins)`
        );

        return aggregatedProteins;
    } catch (error) {
        console.error('Error in getSignificantProteinsByDynaProtExperiment:', error);
        throw error;
    }
};
