import { test } from 'node:test';
import assert from 'node:assert';
import db from '../config/database.js';
import {
  extractProteinAccession,
  getTaxonomyName,
  getDoseResponseExperiments,
  getDifferentialAbundanceByExperimentIDs,
  getDynaProtExperimentMetaData,
  getSignificantProteinsByDynaProtExperiment
} from '../models/searchModel.js';

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

test('getTaxonomyName resolves known taxonomy IDs and reports unknown ones', () => {
  assert.strictEqual(getTaxonomyName(9606), 'Homo sapiens');
  assert.strictEqual(getTaxonomyName(1234), 'Taxonomy ID not found');
});

test('getDoseResponseExperiments returns an empty array for an empty input list without querying the database', async () => {
  const originalQuery = db.query;
  let wasCalled = false;
  db.query = async () => {
    wasCalled = true;
    return [[]];
  };

  try {
    const result = await getDoseResponseExperiments([]);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(wasCalled, false);
  } finally {
    db.query = originalQuery;
  }
});

test('getDoseResponseExperiments queries the database and returns the dynaprot experiment IDs', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;
  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[
      { dynaprot_experiment: 'DPX-001' },
      { dynaprot_experiment: 'DPX-002' }
    ]];
  };

  try {
    const result = await getDoseResponseExperiments(['DPX-001', 'DPX-002']);
    assert.match(capturedQuery, /SELECT DISTINCT dynaprot_experiment/);
    assert.deepStrictEqual(capturedParams, ['DPX-001', 'DPX-002']);
    assert.deepStrictEqual(result, ['DPX-001', 'DPX-002']);
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

    assert.doesNotMatch(queries[0], /qc_pdf_file/);
    assert.match(queries[1], /qc_pdf_file/);
  } finally {
    db.query = originalQuery;
  }
});

test('getSignificantProteinsByDynaProtExperiment aggregates peptide rows by protein accession', async () => {
  const originalQuery = db.query;
  db.query = async () => [[
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

  try {
    const result = await getSignificantProteinsByDynaProtExperiment('DPE-001');

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