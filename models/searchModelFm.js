import db from '../config/database.js';

const aggregateSignificantProteinRows = (rows) => {
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
};

export const extractProteinAccession = (proteinName) => {
    const match = proteinName.match(/^[^|]*\|([^|]+)\|/);
    if (match) {
        return match[1];
    }

    throw new Error(`Protein name "${proteinName}" does not match the expected format.`);
};

export const getDifferentialAbundanceByAccession = async (pgProteinAccessions) => {
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
                 INNER JOIN dynaprot_experiment_comparison AS dxc
                            ON dxc.dpx_comparison = da.dpx_comparison
                 INNER JOIN dynaprot_experiment AS de
                            ON de.dynaprot_experiment = dxc.dynaprot_experiment
        WHERE da.pg_protein_accessions = ?
          AND dxc.is_hidden = 0
          AND de.is_hidden = 0
        ORDER BY da.pos_start
    `, [pgProteinAccessions]);

    return rows;
};

export const getProteinDataByName = async (proteinName) => {
    const query = `
        SELECT seq, protein_name, protein_description
        FROM fm.protein_catalog
        WHERE protein_name LIKE ?
    `;
    const [rows] = await db.query(query, [`%${proteinName}%`]);
    return rows;
};

export const findProteinBySearchTerm = async (searchTerm) => {
    const searchTermWildcard = `%${searchTerm}%`;

    const [rows] = await db.query(
        `SELECT DISTINCT seq, protein_name, protein_description, taxonomy_id, gene_name
         FROM fm.protein_catalog
         WHERE has_differential_abundance = 1
           AND (protein_name LIKE ? OR protein_description LIKE ? OR gene_name LIKE ?)`,
        [searchTermWildcard, searchTermWildcard, searchTermWildcard]
    );

    return rows;
};

export const getSignificantProteinsByExperimentIDs = async (experimentIDs) => {
    if (!Array.isArray(experimentIDs) || experimentIDs.length === 0) {
        return [];
    }

    const placeholders = experimentIDs.map(() => '?').join(',');
    const [rows] = await db.query(
        `
            SELECT dpx_comparison,
                   pg_protein_accessions,
                   diff,
                   adj_pval,
                   protein_description
            FROM fm.significant_peptide_evidence
            WHERE dpx_comparison IN (${placeholders})
            ORDER BY source_sort_rank ASC
        `,
        experimentIDs
    );

    return aggregateSignificantProteinRows(rows);
};

export const getSignificantProteinsByDynaProtExperiment = async (dynaprot_experiment) => {
    const [rows] = await db.query(
        `
            SELECT protein_accession AS proteinAccession,
                   protein_accession AS pg_protein_accessions,
                   diff,
                   max_log2_fc AS maxLog2FC,
                   n_peptides,
                   protein_description,
                   dpx_comparison,
                   adj_pval
            FROM fm.significant_protein_by_experiment
            WHERE dynaprot_experiment = ?
            ORDER BY sort_rank ASC
        `,
        [dynaprot_experiment]
    );

    return rows;
};
