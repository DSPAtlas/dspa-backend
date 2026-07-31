import { test } from 'node:test';
import assert from 'node:assert';
import db from '../config/database.js';
import {
  extractProteinAccession,
  findProteinBySearchTerm,
  getTaxonomyName,
  getDifferentialAbundanceByAccession,
  getDifferentialAbundanceByExperimentIDs,
  getDynaProtExperimentMetaData,
  getSignificantProteinsByDynaProtExperiment,
  getSignificantProteinsByExperimentIDs
} from '../models/searchModel.js';

test('getDifferentialAbundanceByAccession selects the peptide fields needed by Woods plots', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;
  const rows = [{
    differential_abundance_id: 1,
    dpx_comparison: 'CMP-1',
    pg_protein_accessions: 'P11111',
    pep_grouping_key: '_PEPTIDE_',
    pos_start: 2,
    pos_end: 8,
    diff: 1.5,
    adj_pval: 0.01
  }];

  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [rows];
  };

  try {
    assert.deepStrictEqual(await getDifferentialAbundanceByAccession('P11111'), rows);
    assert.match(capturedQuery, /differential_abundance_id/);
    assert.match(capturedQuery, /pep_grouping_key/);
    assert.deepStrictEqual(capturedParams, ['P11111']);
  } finally {
    db.query = originalQuery;
  }
});

test('extractProteinAccession returns the accession from a pipe-delimited protein name', () => {
  assert.strictEqual(
    extractProteinAccession('sp|P12345|ALBU_HUMAN Serum albumin'),
    'P12345'
  );
});

test('extractProteinAccession throws for an invalid protein name format', () => {
  assert.throws(
    () => extractProteinAccession('P12345 ALBU_HUMAN'),
    /does not match the expected format/
  );
});

test('getTaxonomyName resolves taxonomy IDs from the database and reports unknown ones', async () => {
  const originalQuery = db.query;
  const capturedParams = [];
  db.query = async (query, params) => {
    assert.match(query, /FROM organism/);
    capturedParams.push(params);

    if (params[0] === 9606) {
      return [[{ organism_name: 'Homo sapiens' }]];
    }

    return [[]];
  };

  try {
    assert.strictEqual(await getTaxonomyName(9606), 'Homo sapiens');
    assert.strictEqual(await getTaxonomyName(1234), 'Taxonomy ID not found');
    assert.deepStrictEqual(capturedParams, [[9606], [1234]]);
  } finally {
    db.query = originalQuery;
  }
});


test('getDifferentialAbundanceByExperimentIDs returns an empty array for empty input', async () => {
  const originalQuery = db.query;
  let wasCalled = false;
  db.query = async () => {
    wasCalled = true;
    return [[]];
  };

  try {
    const result = await getDifferentialAbundanceByExperimentIDs([]);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(wasCalled, false);
  } finally {
    db.query = originalQuery;
  }
});

test('findProteinBySearchTerm uses EXISTS-based filtering while preserving wildcard parameters', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;
  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[{ protein_name: 'MurA' }]];
  };

  try {
    const result = await findProteinBySearchTerm('mura');

    assert.match(capturedQuery, /EXISTS\s*\(/);
    assert.match(capturedQuery, /SELECT DISTINCT/);
    assert.deepStrictEqual(capturedParams, ['%mura%', '%mura%', '%mura%']);
    assert.deepStrictEqual(result, [{ protein_name: 'MurA' }]);
  } finally {
    db.query = originalQuery;
  }
});

test('differential abundance queries no longer join organism_proteome_entries when not needed', async () => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (query) => {
    queries.push(query);
    return [[{ pg_protein_accessions: 'P11111' }]];
  };

  try {
    await getDifferentialAbundanceByExperimentIDs(['CMP-001', 'CMP-002']);

    assert.strictEqual(queries.length, 1);
    assert.doesNotMatch(queries[0], /organism_proteome_entries/);
  } finally {
    db.query = originalQuery;
  }
});

test('getDynaProtExperimentMetaData optionally includes the QC PDF field', async () => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (query) => {
    queries.push(query);
    return [[{ dynaprot_experiment: 'DPX-001' }]];
  };

  try {
    await getDynaProtExperimentMetaData('DPX-001');
    await getDynaProtExperimentMetaData('DPX-001', { includeQcPdf: true });

    assert.match(queries[0], /perturbation/);
    assert.match(queries[1], /perturbation/);
    assert.doesNotMatch(queries[0], /qc_pdf_file/);
    assert.match(queries[1], /qc_pdf_file/);
  } finally {
    db.query = originalQuery;
  }
});

test('getSignificantProteinsByDynaProtExperiment aggregates peptide rows by protein accession', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  db.query = async (query) => {
    capturedQuery = query;
    return [[
      {
        dpx_comparison: 'CMP-001',
        pg_protein_accessions: 'P11111',
        diff: 2.5,
        adj_pval: 0.001,
        protein_description: null
      },
      {
        dpx_comparison: 'CMP-002',
        pg_protein_accessions: 'P11111',
        diff: 1.8,
        adj_pval: 0.002,
        protein_description: 'Protein one'
      },
      {
        dpx_comparison: 'CMP-003',
        pg_protein_accessions: 'Q22222',
        diff: -4.2,
        adj_pval: 0.003,
        protein_description: 'Protein two'
      },
      {
        dpx_comparison: 'CMP-004',
        pg_protein_accessions: '',
        diff: 10,
        adj_pval: 0.004,
        protein_description: 'Ignored'
      }
    ]];
  };

  try {
    const result = await getSignificantProteinsByDynaProtExperiment('DPE-001');

    assert.match(capturedQuery, /da\.diff < -1 OR da\.diff > 1/);
    assert.match(capturedQuery, /ORDER BY ABS\(da\.diff\) DESC/);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      proteinAccession: 'Q22222',
      pg_protein_accessions: 'Q22222',
      diff: -4.2,
      maxLog2FC: -4.2,
      n_peptides: 1,
      protein_description: 'Protein two',
      dpx_comparison: 'CMP-003',
      adj_pval: 0.003
    });
    assert.deepStrictEqual(result[1], {
      proteinAccession: 'P11111',
      pg_protein_accessions: 'P11111',
      diff: 2.5,
      maxLog2FC: 2.5,
      n_peptides: 2,
      protein_description: 'Protein one',
      dpx_comparison: 'CMP-001',
      adj_pval: 0.001
    });
  } finally {
    db.query = originalQuery;
  }
});

test('getSignificantProteinsByExperimentIDs returns an empty array for empty input without querying the database', async () => {
  const originalQuery = db.query;
  let wasCalled = false;
  db.query = async () => {
    wasCalled = true;
    return [[]];
  };

  try {
    const result = await getSignificantProteinsByExperimentIDs([]);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(wasCalled, false);
  } finally {
    db.query = originalQuery;
  }
});

test('getSignificantProteinsByExperimentIDs aggregates significant peptide rows by protein accession', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;
  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[
      {
        dpx_comparison: 'CMP-001',
        pg_protein_accessions: 'P11111',
        diff: -3.5,
        adj_pval: 0.001,
        protein_description: 'Protein one from strongest row'
      },
      {
        dpx_comparison: 'CMP-002',
        pg_protein_accessions: 'P11111',
        diff: 2.0,
        adj_pval: 0.002,
        protein_description: 'Protein one later row'
      },
      {
        dpx_comparison: 'CMP-002',
        pg_protein_accessions: 'Q22222',
        diff: 4.5,
        adj_pval: 0.003,
        protein_description: 'Protein two'
      },
      {
        dpx_comparison: 'CMP-003',
        pg_protein_accessions: '',
        diff: 9.9,
        adj_pval: 0.004,
        protein_description: 'Ignored'
      }
    ]];
  };

  try {
    const result = await getSignificantProteinsByExperimentIDs(['CMP-001', 'CMP-002']);

    assert.match(capturedQuery, /FROM differential_abundance da/);
    assert.match(capturedQuery, /LEFT JOIN protein_scores ps/);
    assert.match(capturedQuery, /ope_exact\.protein_description/);
    assert.match(capturedQuery, /ope_any\.protein_description/);
    assert.match(capturedQuery, /NULLIF\(ps\.protein_description, 'Description not available'\)/);
    assert.match(capturedQuery, /da\.adj_pval < 0\.05/);
    assert.match(capturedQuery, /da\.diff < -1 OR da\.diff > 1/);
    assert.match(capturedQuery, /ORDER BY ABS\(da\.diff\) DESC/);
    assert.deepStrictEqual(capturedParams, ['CMP-001', 'CMP-002']);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      proteinAccession: 'Q22222',
      pg_protein_accessions: 'Q22222',
      diff: 4.5,
      maxLog2FC: 4.5,
      n_peptides: 1,
      protein_description: 'Protein two',
      dpx_comparison: 'CMP-002',
      adj_pval: 0.003
    });
    assert.deepStrictEqual(result[1], {
      proteinAccession: 'P11111',
      pg_protein_accessions: 'P11111',
      diff: -3.5,
      maxLog2FC: -3.5,
      n_peptides: 2,
      protein_description: 'Protein one from strongest row',
      dpx_comparison: 'CMP-001',
      adj_pval: 0.001
    });
  } finally {
    db.query = originalQuery;
  }
});
