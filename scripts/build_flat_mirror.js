import mysql from 'mysql2/promise';

const FLAT_SCHEMA = process.env.DSPA_FLAT_MIRROR_SCHEMA || 'fm';
const BATCH_SIZE = Number(process.env.DSPA_FLAT_MIRROR_BATCH_SIZE || 1000);

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

const assertIdentifier = (identifier) => {
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
        throw new Error(`Unsafe SQL identifier: ${identifier}`);
    }
};

const quoteIdentifier = (identifier) => {
    assertIdentifier(identifier);
    return `\`${identifier}\``;
};

const quotedSchema = quoteIdentifier(FLAT_SCHEMA);

const connect = () => mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'dynaprotdbv2',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    multipleStatements: false
});

const timed = async (label, callback) => {
    const start = process.hrtime.bigint();
    const result = await callback();
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.info(`${label}: ${elapsedMs.toFixed(2)} ms`);
    return result;
};

const tableName = (name) => `${quotedSchema}.${quoteIdentifier(name)}`;

const countRows = async (connection, table) => {
    const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${tableName(table)}`);
    return rows[0].row_count;
};

const toDbValue = (value) => value === undefined ? null : value;

const bulkInsert = async (connection, table, columns, rows) => {
    if (rows.length === 0) {
        return;
    }

    const quotedColumns = columns.map(quoteIdentifier).join(', ');

    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
        const batch = rows.slice(index, index + BATCH_SIZE);
        const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
        const placeholders = batch.map(() => rowPlaceholders).join(', ');
        const values = batch.flatMap((row) => columns.map((column) => toDbValue(row[column])));

        await connection.query(
            `INSERT INTO ${tableName(table)} (${quotedColumns}) VALUES ${placeholders}`,
            values
        );
    }
};

const createSchema = async (connection) => {
    await connection.query(`DROP SCHEMA IF EXISTS ${quotedSchema}`);
    await connection.query(`CREATE SCHEMA ${quotedSchema}`);
};

const createProteinDescriptionTables = async (connection) => {
    await connection.query(`
        CREATE TABLE ${tableName('protein_description_by_name_taxonomy')} (
            protein_name VARCHAR(255) NOT NULL,
            taxonomy_id INT NOT NULL,
            protein_description VARCHAR(255) DEFAULT NULL,
            PRIMARY KEY (protein_name, taxonomy_id),
            KEY idx_taxonomy_id (taxonomy_id)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        INSERT INTO ${tableName('protein_description_by_name_taxonomy')} (
            protein_name,
            taxonomy_id,
            protein_description
        )
        SELECT protein_name,
               taxonomy_id,
               MAX(protein_description) AS protein_description
        FROM organism_proteome_entries
        WHERE protein_name IS NOT NULL
          AND taxonomy_id IS NOT NULL
        GROUP BY protein_name, taxonomy_id
    `);

    await connection.query(`
        CREATE TABLE ${tableName('protein_description_by_name')} (
            protein_name VARCHAR(255) NOT NULL,
            protein_description VARCHAR(255) DEFAULT NULL,
            PRIMARY KEY (protein_name)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        INSERT INTO ${tableName('protein_description_by_name')} (
            protein_name,
            protein_description
        )
        SELECT protein_name,
               MAX(protein_description) AS protein_description
        FROM organism_proteome_entries
        WHERE protein_name IS NOT NULL
        GROUP BY protein_name
    `);
};

const createProteinCatalog = async (connection) => {
    await connection.query(`
        CREATE TABLE ${tableName('protein_with_differential_abundance')} (
            protein_name VARCHAR(255) NOT NULL,
            PRIMARY KEY (protein_name)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        INSERT INTO ${tableName('protein_with_differential_abundance')} (protein_name)
        SELECT DISTINCT pg_protein_accessions
        FROM differential_abundance
        WHERE pg_protein_accessions IS NOT NULL
          AND pg_protein_accessions <> ''
    `);

    await connection.query(`
        CREATE TABLE ${tableName('protein_catalog')} (
            proteome_id VARCHAR(20) NOT NULL,
            taxonomy_id INT DEFAULT NULL,
            seq_id VARCHAR(255) NOT NULL,
            seq TEXT,
            protein_name VARCHAR(255) DEFAULT NULL,
            protein_description VARCHAR(255) DEFAULT NULL,
            gene_name VARCHAR(255) DEFAULT NULL,
            has_differential_abundance TINYINT(1) NOT NULL,
            PRIMARY KEY (proteome_id, seq_id),
            KEY idx_protein_name (protein_name),
            KEY idx_taxonomy_protein (taxonomy_id, protein_name),
            KEY idx_has_da_protein (has_differential_abundance, protein_name)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        INSERT INTO ${tableName('protein_catalog')} (
            proteome_id,
            taxonomy_id,
            seq_id,
            seq,
            protein_name,
            protein_description,
            gene_name,
            has_differential_abundance
        )
        SELECT ope.proteome_id,
               ope.taxonomy_id,
               ope.seq_id,
               ope.seq,
               ope.protein_name,
               ope.protein_description,
               ope.gene_name,
               IF(da_protein.protein_name IS NULL, 0, 1) AS has_differential_abundance
        FROM organism_proteome_entries ope
                 LEFT JOIN ${tableName('protein_with_differential_abundance')} da_protein
                           ON da_protein.protein_name = ope.protein_name
    `);
};

const createSignificantPeptideEvidence = async (connection) => {
    await connection.query(`
        CREATE TABLE ${tableName('significant_peptide_evidence')} (
            source_sort_rank INT NOT NULL AUTO_INCREMENT,
            differential_abundance_id INT NOT NULL,
            \`condition\` VARCHAR(225) DEFAULT NULL,
            taxonomy_id INT DEFAULT NULL,
            condition_key VARCHAR(512) NOT NULL,
            dynaprot_experiment VARCHAR(11) DEFAULT NULL,
            dpx_comparison VARCHAR(20) DEFAULT NULL,
            pg_protein_accessions VARCHAR(255) DEFAULT NULL,
            pep_grouping_key VARCHAR(255) DEFAULT NULL,
            pos_start INT DEFAULT NULL,
            pos_end INT DEFAULT NULL,
            diff FLOAT DEFAULT NULL,
            adj_pval FLOAT DEFAULT NULL,
            abs_diff DOUBLE DEFAULT NULL,
            protein_description_exact VARCHAR(255) DEFAULT NULL,
            protein_description_any VARCHAR(255) DEFAULT NULL,
            protein_score_description TEXT DEFAULT NULL,
            protein_description TEXT DEFAULT NULL,
            PRIMARY KEY (source_sort_rank),
            UNIQUE KEY idx_differential_abundance_id (differential_abundance_id),
            KEY idx_comparison_order (dpx_comparison, abs_diff, adj_pval, differential_abundance_id),
            KEY idx_experiment_order (dynaprot_experiment, abs_diff, adj_pval, differential_abundance_id),
            KEY idx_condition_taxonomy_order (\`condition\`, taxonomy_id, abs_diff, adj_pval, differential_abundance_id),
            KEY idx_protein (pg_protein_accessions)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        INSERT INTO ${tableName('significant_peptide_evidence')} (
            differential_abundance_id,
            \`condition\`,
            taxonomy_id,
            condition_key,
            dynaprot_experiment,
            dpx_comparison,
            pg_protein_accessions,
            pep_grouping_key,
            pos_start,
            pos_end,
            diff,
            adj_pval,
            abs_diff,
            protein_description_exact,
            protein_description_any,
            protein_score_description,
            protein_description
        )
        SELECT da.differential_abundance_id,
               comparison.\`condition\`,
               comparison.taxonomy_id,
               CONCAT(
                   COALESCE(comparison.\`condition\`, ''),
                   '|||',
                   COALESCE(CAST(comparison.taxonomy_id AS CHAR), '')
               ) AS condition_key,
               comparison.dynaprot_experiment,
               da.dpx_comparison,
               da.pg_protein_accessions,
               da.pep_grouping_key,
               da.pos_start,
               da.pos_end,
               da.diff,
               da.adj_pval,
               ABS(da.diff) AS abs_diff,
               ope_exact.protein_description AS protein_description_exact,
               ope_any.protein_description AS protein_description_any,
               NULLIF(ps.protein_description, 'Description not available') AS protein_score_description,
               COALESCE(
                   ope_exact.protein_description,
                   ope_any.protein_description,
                   NULLIF(ps.protein_description, 'Description not available')
               ) AS protein_description
        FROM differential_abundance da
                 LEFT JOIN dynaprot_experiment_comparison comparison
                           ON comparison.dpx_comparison = da.dpx_comparison
                 LEFT JOIN protein_scores ps
                           ON ps.dpx_comparison = da.dpx_comparison
                               AND ps.pg_protein_accessions = da.pg_protein_accessions
                 LEFT JOIN ${tableName('protein_description_by_name_taxonomy')} ope_exact
                           ON ope_exact.protein_name = da.pg_protein_accessions
                               AND ope_exact.taxonomy_id = comparison.taxonomy_id
                 LEFT JOIN ${tableName('protein_description_by_name')} ope_any
                           ON ope_any.protein_name = da.pg_protein_accessions
        WHERE da.adj_pval < 0.05
          AND (da.diff < -1 OR da.diff > 1)
        ORDER BY ABS(da.diff) DESC, da.adj_pval ASC, da.differential_abundance_id ASC
    `);
};

const createSummaryTables = async (connection) => {
    await connection.query(`
        CREATE TABLE ${tableName('significant_protein_by_comparison')} (
            dpx_comparison VARCHAR(20) NOT NULL,
            sort_rank INT NOT NULL,
            protein_accession VARCHAR(255) NOT NULL,
            diff FLOAT DEFAULT NULL,
            max_log2_fc FLOAT DEFAULT NULL,
            n_peptides INT NOT NULL,
            protein_description TEXT DEFAULT NULL,
            adj_pval FLOAT DEFAULT NULL,
            abs_max_log2fc DOUBLE DEFAULT NULL,
            PRIMARY KEY (dpx_comparison, protein_accession),
            UNIQUE KEY idx_comparison_rank (dpx_comparison, sort_rank)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE ${tableName('significant_protein_by_experiment')} (
            dynaprot_experiment VARCHAR(11) NOT NULL,
            sort_rank INT NOT NULL,
            protein_accession VARCHAR(255) NOT NULL,
            diff FLOAT DEFAULT NULL,
            max_log2_fc FLOAT DEFAULT NULL,
            n_peptides INT NOT NULL,
            protein_description TEXT DEFAULT NULL,
            dpx_comparison VARCHAR(20) DEFAULT NULL,
            adj_pval FLOAT DEFAULT NULL,
            abs_max_log2fc DOUBLE DEFAULT NULL,
            PRIMARY KEY (dynaprot_experiment, protein_accession),
            UNIQUE KEY idx_experiment_rank (dynaprot_experiment, sort_rank)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE ${tableName('significant_protein_by_condition_taxonomy')} (
            condition_key VARCHAR(512) NOT NULL,
            \`condition\` VARCHAR(225) DEFAULT NULL,
            taxonomy_id INT DEFAULT NULL,
            sort_rank INT NOT NULL,
            protein_accession VARCHAR(255) NOT NULL,
            diff FLOAT DEFAULT NULL,
            max_log2_fc FLOAT DEFAULT NULL,
            n_peptides INT NOT NULL,
            protein_description TEXT DEFAULT NULL,
            dpx_comparison VARCHAR(20) DEFAULT NULL,
            adj_pval FLOAT DEFAULT NULL,
            abs_max_log2fc DOUBLE DEFAULT NULL,
            PRIMARY KEY (condition_key, protein_accession),
            UNIQUE KEY idx_condition_rank (condition_key, sort_rank)
        ) ENGINE=InnoDB
    `);
};

const groupBy = (rows, getKey, getGrain, descriptionColumn) => {
    const groups = new Map();

    rows.forEach((row) => {
        const key = getKey(row);
        if (!key) {
            return;
        }

        if (!groups.has(key)) {
            groups.set(key, {
                grain: getGrain(row),
                rows: []
            });
        }

        groups.get(key).rows.push({
            dpx_comparison: row.dpx_comparison,
            pg_protein_accessions: row.pg_protein_accessions,
            diff: row.diff,
            adj_pval: row.adj_pval,
            protein_description: row[descriptionColumn] || null
        });
    });

    return groups;
};

const buildSummaryRows = (groups) => {
    const summaryRows = [];

    groups.forEach(({ grain, rows }) => {
        const proteins = aggregateSignificantProteinRows(rows);

        proteins.forEach((protein, index) => {
            summaryRows.push({
                ...grain,
                sort_rank: index + 1,
                protein_accession: protein.proteinAccession,
                diff: protein.diff,
                max_log2_fc: protein.maxLog2FC,
                n_peptides: protein.n_peptides,
                protein_description: protein.protein_description,
                dpx_comparison: protein.dpx_comparison,
                adj_pval: protein.adj_pval,
                abs_max_log2fc: Math.abs(Number(protein.maxLog2FC))
            });
        });
    });

    return summaryRows;
};

const populateSummaryTables = async (connection) => {
    const [evidenceRows] = await connection.query(`
        SELECT source_sort_rank,
               differential_abundance_id,
               \`condition\`,
               taxonomy_id,
               condition_key,
               dynaprot_experiment,
               dpx_comparison,
               pg_protein_accessions,
               diff,
               adj_pval,
               protein_description_exact,
               protein_description
        FROM ${tableName('significant_peptide_evidence')}
        ORDER BY source_sort_rank ASC
    `);

    const comparisonRows = buildSummaryRows(groupBy(
        evidenceRows,
        (row) => row.dpx_comparison,
        (row) => ({ dpx_comparison: row.dpx_comparison }),
        'protein_description'
    ));

    const experimentRows = buildSummaryRows(groupBy(
        evidenceRows,
        (row) => row.dynaprot_experiment,
        (row) => ({ dynaprot_experiment: row.dynaprot_experiment }),
        'protein_description_exact'
    ));

    const conditionRows = buildSummaryRows(groupBy(
        evidenceRows,
        (row) => row.condition_key,
        (row) => ({
            condition_key: row.condition_key,
            condition: row.condition,
            taxonomy_id: row.taxonomy_id
        }),
        'protein_description'
    ));

    await bulkInsert(connection, 'significant_protein_by_comparison', [
        'dpx_comparison',
        'sort_rank',
        'protein_accession',
        'diff',
        'max_log2_fc',
        'n_peptides',
        'protein_description',
        'adj_pval',
        'abs_max_log2fc'
    ], comparisonRows);

    await bulkInsert(connection, 'significant_protein_by_experiment', [
        'dynaprot_experiment',
        'sort_rank',
        'protein_accession',
        'diff',
        'max_log2_fc',
        'n_peptides',
        'protein_description',
        'dpx_comparison',
        'adj_pval',
        'abs_max_log2fc'
    ], experimentRows);

    await bulkInsert(connection, 'significant_protein_by_condition_taxonomy', [
        'condition_key',
        'condition',
        'taxonomy_id',
        'sort_rank',
        'protein_accession',
        'diff',
        'max_log2_fc',
        'n_peptides',
        'protein_description',
        'dpx_comparison',
        'adj_pval',
        'abs_max_log2fc'
    ], conditionRows);
};

const createBuildMetadata = async (connection) => {
    await connection.query(`
        CREATE TABLE ${tableName('build_metadata')} (
            id TINYINT NOT NULL PRIMARY KEY,
            built_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            source_database VARCHAR(255) NOT NULL,
            significant_peptide_evidence_rows INT NOT NULL,
            significant_protein_by_comparison_rows INT NOT NULL,
            significant_protein_by_experiment_rows INT NOT NULL,
            significant_protein_by_condition_taxonomy_rows INT NOT NULL
        ) ENGINE=InnoDB
    `);

    const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');

    await connection.query(
        `
            INSERT INTO ${tableName('build_metadata')} (
                id,
                source_database,
                significant_peptide_evidence_rows,
                significant_protein_by_comparison_rows,
                significant_protein_by_experiment_rows,
                significant_protein_by_condition_taxonomy_rows
            )
            VALUES (1, ?, ?, ?, ?, ?)
        `,
        [
            databaseRow.database_name,
            await countRows(connection, 'significant_peptide_evidence'),
            await countRows(connection, 'significant_protein_by_comparison'),
            await countRows(connection, 'significant_protein_by_experiment'),
            await countRows(connection, 'significant_protein_by_condition_taxonomy')
        ]
    );
};

const logCounts = async (connection) => {
    const tables = [
        'protein_description_by_name_taxonomy',
        'protein_description_by_name',
        'protein_with_differential_abundance',
        'protein_catalog',
        'significant_peptide_evidence',
        'significant_protein_by_comparison',
        'significant_protein_by_experiment',
        'significant_protein_by_condition_taxonomy'
    ];

    for (const table of tables) {
        console.info(`${FLAT_SCHEMA}.${table}: ${await countRows(connection, table)} rows`);
    }
};

const main = async () => {
    const connection = await connect();

    try {
        await timed(`Recreate schema ${FLAT_SCHEMA}`, () => createSchema(connection));
        await timed('Build protein description lookup tables', () => createProteinDescriptionTables(connection));
        await timed('Build protein catalog tables', () => createProteinCatalog(connection));
        await timed('Build significant peptide evidence table', () => createSignificantPeptideEvidence(connection));
        await timed('Create significant protein summary tables', () => createSummaryTables(connection));
        await timed('Populate significant protein summary tables', () => populateSummaryTables(connection));
        await timed('Write build metadata', () => createBuildMetadata(connection));
        await logCounts(connection);
    } finally {
        await connection.end();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
