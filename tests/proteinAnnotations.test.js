import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnnotationUnavailableError, fetchProteinAnnotations } from '../models/proteinAnnotations.js';

const json = body => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const unavailable = () => new Response('<html>Service unavailable</html>', {
  status: 503, headers: { 'Content-Type': 'text/html' },
});
const sequence = 'ACDEFGHIKL';
const entry = overrides => ({ primaryAccession: 'P02413', sequence: { value: sequence }, ...overrides });

test('successful EBI annotations preserve the existing payload and request JSON', async () => {
  const payload = { accession: 'P02413', sequence, features: [{ type: 'DOMAIN', begin: '1', end: '4' }] };
  let calls = 0;
  const result = await fetchProteinAnnotations('P02413', { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://www.ebi.ac.uk/proteins/api/features/P02413');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    return json(payload);
  } });
  assert.deepEqual(result, payload);
  assert.equal(calls, 1);
});

test('an HTML 503 uses UniProtKB with mapped coordinates and all original metadata', async () => {
  const types = {
    Domain: 'DOMAIN', Site: 'SITE', 'Binding site': 'BINDING', 'Active site': 'ACT_SITE',
    'Metal binding': 'METAL', 'Modified residue': 'MOD_RES', 'Disulfide bond': 'DISULFID',
    'Beta strand': 'STRAND', Helix: 'HELIX', Turn: 'TURN', 'Coiled coil': 'COILED',
    Region: 'Region', constructor: 'constructor',
  };
  const features = Object.keys(types).map(type => ({
    type, location: { start: { value: 2 }, end: { value: 5 } },
    description: 'Original description', ligand: { name: 'ATP' },
    evidences: [{ evidenceCode: 'ECO:0000269' }],
  }));
  features.push({ type: 'Site', location: { start: { modifier: 'UNKNOWN' }, end: { modifier: 'UNKNOWN' } } });
  const calls = [];
  const result = await fetchProteinAnnotations('P02413', { fetchImpl: async url => {
    calls.push(url);
    return calls.length === 1 ? unavailable() : json(entry({ features }));
  } });
  assert.deepEqual(calls, [
    'https://www.ebi.ac.uk/proteins/api/features/P02413',
    'https://rest.uniprot.org/uniprotkb/P02413.json',
  ]);
  assert.equal(result.source, 'UniProtKB');
  assert.equal(result.sequence, sequence);
  assert.equal(result.features.length, features.length);
  Object.values(types).forEach((type, index) => {
    assert.deepEqual(result.features[index], { ...features[index], type, begin: 2, end: 5 });
  });
  assert.equal(result.features.at(-1).type, 'SITE');
  assert.equal(result.features.at(-1).begin, undefined);
  assert.equal(result.features.at(-1).end, undefined);
});

test('invalid JSON, content types, and payloads also use the fallback', async () => {
  for (const first of [
    () => new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => json({ error: 'not annotation data' }),
    () => json({ accession: 'OTHER', features: [] }),
  ]) {
    let count = 0;
    const result = await fetchProteinAnnotations('P02413', {
      fetchImpl: async () => ++count === 1 ? first() : json(entry({ features: [] })),
    });
    assert.equal(result.accession, 'P02413');
    assert.equal(result.source, 'UniProtKB');
    assert.equal(count, 2);
  }
});

test('UniProtKB accepts a matching secondary accession but rejects another entry', async () => {
  const fetchEntry = payload => {
    let calls = 0;
    return async () => ++calls === 1 ? unavailable() : json(payload);
  };
  const result = await fetchProteinAnnotations('P02413', {
    fetchImpl: fetchEntry(entry({ primaryAccession: 'P0A7U7', secondaryAccessions: ['P02413'] })),
  });
  assert.equal(result.accession, 'P0A7U7');
  for (const invalid of [
    entry({ primaryAccession: 'OTHER' }),
    { secondaryAccessions: ['P02413'], sequence: { value: sequence } },
    entry({ sequence: { value: null } }),
    entry({ features: [null] }),
  ]) {
    await assert.rejects(fetchProteinAnnotations('P02413', { fetchImpl: fetchEntry(invalid) }), AnnotationUnavailableError);
  }
});

test('both provider failures yield a controlled error without upstream HTML', async () => {
  await assert.rejects(fetchProteinAnnotations('P02413', { fetchImpl: async () => unavailable() }), error => {
    assert.ok(error instanceof AnnotationUnavailableError);
    assert.match(error.message, /Local experimental data is still available/);
    assert.doesNotMatch(error.message, /<html>|Unexpected token/);
    return true;
  });
});

test('a network timeout aborts the request and tries the fixed fallback', async () => {
  let calls = 0;
  let aborted = false;
  const result = await fetchProteinAnnotations('P02413', {
    timeoutMs: 10,
    fetchImpl: async (url, { signal }) => {
      if (++calls === 2) return json(entry());
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true }));
    },
  });
  assert.equal(aborted, true);
  assert.equal(result.source, 'UniProtKB');
});

test('the request deadline remains active while reading an upstream body', async () => {
  let calls = 0;
  const result = await fetchProteinAnnotations('P02413', {
    timeoutMs: 10,
    fetchImpl: async (url, { signal }) => {
      if (++calls === 2) return json(entry());
      return {
        ok: true, headers: new Headers({ 'content-type': 'application/json' }),
        json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
      };
    },
  });
  assert.equal(result.source, 'UniProtKB');
  assert.equal(calls, 2);
});
