import { test } from 'node:test';
import assert from 'node:assert';
import db from '../config/database.js';
import {
  findProteinBySearchTerm,
  getDifferentialAbundanceByAccession,
  getProteinDataByName,
  getSignificantProteinsByDynaProtExperiment,
  getSignificantProteinsByExperimentIDs
} from '../models/searchModelFm.js';

test('FM protein peptide lookup selects the fields needed by Woods plots', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;

  db.query = async (query) => {
    capturedQuery = query;
    return [[]];
  };

  try {
    await getDifferentialAbundanceByAccession('P11111');
    assert.match(capturedQuery, /differential_abundance_id/);
    assert.match(capturedQuery, /pep_grouping_key/);
  } finally {
    db.query = originalQuery;
  }
});

test('FM protein search reads from fm.protein_catalog', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;

  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[{ protein_name: 'P11111' }]];
  };

  try {
    const result = await findProteinBySearchTerm('kinase');

    assert.match(capturedQuery, /FROM fm\.protein_catalog/);
    assert.match(capturedQuery, /has_differential_abundance = 1/);
    assert.doesNotMatch(capturedQuery, /EXISTS\s*\(/);
    assert.deepStrictEqual(capturedParams, ['%kinase%', '%kinase%', '%kinase%']);
    assert.deepStrictEqual(result, [{ protein_name: 'P11111' }]);
  } finally {
    db.query = originalQuery;
  }
});

test('FM protein lookup reads sequence rows from fm.protein_catalog', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;

  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[{ seq: 'MPEPTIDE', protein_name: 'P11111', protein_description: 'Protein one' }]];
  };

  try {
    const result = await getProteinDataByName('P11111');

    assert.match(capturedQuery, /FROM fm\.protein_catalog/);
    assert.deepStrictEqual(capturedParams, ['%P11111%']);
    assert.deepStrictEqual(result, [
      { seq: 'MPEPTIDE', protein_name: 'P11111', protein_description: 'Protein one' }
    ]);
  } finally {
    db.query = originalQuery;
  }
});

test('FM significant proteins by comparison list aggregate fm.significant_peptide_evidence rows', async () => {
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
        protein_description: 'Protein one'
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
      }
    ]];
  };

  try {
    const result = await getSignificantProteinsByExperimentIDs(['CMP-001', 'CMP-002']);

    assert.match(capturedQuery, /FROM fm\.significant_peptide_evidence/);
    assert.match(capturedQuery, /ORDER BY source_sort_rank ASC/);
    assert.deepStrictEqual(capturedParams, ['CMP-001', 'CMP-002']);
    assert.deepStrictEqual(result, [
      {
        proteinAccession: 'Q22222',
        pg_protein_accessions: 'Q22222',
        diff: 4.5,
        maxLog2FC: 4.5,
        n_peptides: 1,
        protein_description: 'Protein two',
        dpx_comparison: 'CMP-002',
        adj_pval: 0.003
      },
      {
        proteinAccession: 'P11111',
        pg_protein_accessions: 'P11111',
        diff: -3.5,
        maxLog2FC: -3.5,
        n_peptides: 2,
        protein_description: 'Protein one',
        dpx_comparison: 'CMP-001',
        adj_pval: 0.001
      }
    ]);
  } finally {
    db.query = originalQuery;
  }
});

test('FM significant proteins by experiment read pre-ranked materialized rows', async () => {
  const originalQuery = db.query;
  let capturedQuery = null;
  let capturedParams = null;

  db.query = async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return [[
      {
        proteinAccession: 'Q22222',
        pg_protein_accessions: 'Q22222',
        diff: 4.5,
        maxLog2FC: 4.5,
        n_peptides: 1,
        protein_description: 'Protein two',
        dpx_comparison: 'CMP-002',
        adj_pval: 0.003
      }
    ]];
  };

  try {
    const result = await getSignificantProteinsByDynaProtExperiment('DPE-001');

    assert.match(capturedQuery, /FROM fm\.significant_protein_by_experiment/);
    assert.match(capturedQuery, /ORDER BY sort_rank ASC/);
    assert.deepStrictEqual(capturedParams, ['DPE-001']);
    assert.deepStrictEqual(result, [
      {
        proteinAccession: 'Q22222',
        pg_protein_accessions: 'Q22222',
        diff: 4.5,
        maxLog2FC: 4.5,
        n_peptides: 1,
        protein_description: 'Protein two',
        dpx_comparison: 'CMP-002',
        adj_pval: 0.003
      }
    ]);
  } finally {
    db.query = originalQuery;
  }
});
