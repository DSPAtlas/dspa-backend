import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'dspa-annotations-'));
process.env.UNIPROT_CACHE_DIR = cache;
const { default: db } = await import('../config/database.js');
const { getUniprotData } = await import('../models/searchModel.js');
const { searchProteins } = await import('../controllers/proteinController.js');
const originalFetch = globalThis.fetch;
const originalQuery = db.query;
const originalWarn = console.warn;

after(async () => {
  globalThis.fetch = originalFetch;
  db.query = originalQuery;
  console.warn = originalWarn;
  await db.end();
  await fs.rm(cache, { recursive: true, force: true });
});

const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const unavailable = () => new Response('<html>Service unavailable</html>', {
  status: 503, headers: { 'Content-Type': 'text/html' },
});
function mockDatabase(accession = 'P02413') {
  db.query = async query => {
    if (query.includes('FROM organism_proteome_entries')) {
      return [[{ seq: 'ACDEFG', protein_name: accession, protein_description: 'Local protein' }]];
    }
    if (query.includes('FROM differential_abundance')) {
      return [[{ differential_abundance_id: 1, dpx_comparison: 'CMP-1', pg_protein_accessions: accession,
        pep_grouping_key: 'ACDE', pos_start: 1, pos_end: 4, diff: 2, adj_pval: 0.01 }]];
    }
    if (query.includes('FROM dynaprot_experiment_comparison')) {
      return [[{ dpx_comparison: 'CMP-1', taxonomy_id: 9606, condition: 'Local condition' }]];
    }
    throw new Error('Unexpected query');
  };
}
async function request(proteinName) {
  let status = 200, body;
  const response = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  await searchProteins({ query: { proteinName } }, response);
  return { status, body };
}

test('a provider outage returns local sequence, peptides, scores and metadata with an explicit warning', async () => {
  mockDatabase();
  globalThis.fetch = async () => unavailable();
  console.warn = () => {};
  const { status, body } = await request('P02413');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.proteinData.proteinSequence, 'ACDEFG');
  assert.equal(body.proteinData.peptideLevelData.length, 1);
  assert.equal(body.proteinData.lipscoreList.length, 1);
  assert.equal(body.proteinData.experimentMetaData[0].condition, 'Local condition');
  assert.deepEqual(body.proteinData.featuresData, {
    accession: 'P02413', sequence: 'ACDEFG', features: [], available: false,
    message: 'Protein annotations are temporarily unavailable. Local experimental data is still available.',
  });
  assert.doesNotMatch(JSON.stringify(body), /<html>|Unexpected token/);
});

test('outages are not cached and a successful fallback is reused by later requests', async () => {
  mockDatabase();
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return url.includes('ebi.ac.uk') ? unavailable() : json({
      primaryAccession: 'P02413', sequence: { value: 'ACDEFG' },
      features: [{ type: 'Domain', location: { start: { value: 1 }, end: { value: 4 } } }],
    });
  };
  const recovered = await request('P02413');
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.proteinData.featuresData.source, 'UniProtKB');
  assert.equal(recovered.body.proteinData.featuresData.features[0].type, 'DOMAIN');
  assert.equal(calls.length, 2);
  globalThis.fetch = async () => { throw new Error('Successful annotations should come from cache'); };
  const cached = await request('P02413');
  assert.deepEqual(cached.body, recovered.body);
});

test('annotations use the canonical database accession instead of the search text', async () => {
  mockDatabase('P0A7U7');
  globalThis.fetch = async url => {
    assert.equal(url, 'https://www.ebi.ac.uk/proteins/api/features/P0A7U7');
    return json({ accession: 'P0A7U7', sequence: 'ACDEFG', features: [] });
  };
  const { status, body } = await request('a protein search term');
  assert.equal(status, 200);
  assert.equal(body.proteinData.featuresData.accession, 'P0A7U7');
});

test('database errors remain errors instead of being reported as missing annotations', async () => {
  db.query = async () => { throw new Error('Database failure'); };
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Should not fetch annotations'); };
  const { status, body } = await request('P99999');
  assert.equal(status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error, 'Database failure');
  assert.equal(calls, 0);
});

test('an unreadable cache does not prevent fetching valid annotations', async () => {
  const blocked = path.join(cache, 'not-a-directory');
  await fs.writeFile(blocked, 'file');
  process.env.UNIPROT_CACHE_DIR = blocked;
  const uncached = await import('../models/searchModel.js?unreadable-cache');
  globalThis.fetch = async () => json({ accession: 'P99999', features: [] });
  assert.deepEqual(await uncached.getUniprotData('P99999'), { accession: 'P99999', features: [] });
  process.env.UNIPROT_CACHE_DIR = cache;
});

test('invalid cached annotation data is replaced by a valid upstream response', async () => {
  const indexPath = path.join(cache, 'index.json');
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  const key = 'uniprot:INVALID';
  const file = 'invalid-annotation.json';
  await fs.writeFile(path.join(cache, file), JSON.stringify({ error: 'old invalid data' }));
  index.entries[key] = { file, size: 28, storedAt: Date.now(), lastAccessed: Date.now() };
  index.totalBytes += 28;
  await fs.writeFile(indexPath, JSON.stringify(index));
  globalThis.fetch = async () => json({ accession: 'INVALID', features: [] });
  assert.deepEqual(await getUniprotData('invalid'), { accession: 'INVALID', features: [] });
});
