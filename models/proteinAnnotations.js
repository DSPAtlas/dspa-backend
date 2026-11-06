const EBI_FEATURES_URL = 'https://www.ebi.ac.uk/proteins/api/features/';
const UNIPROT_ENTRY_URL = 'https://rest.uniprot.org/uniprotkb/';

const FEATURE_TYPES = Object.freeze({
  Domain: 'DOMAIN',
  Site: 'SITE',
  'Binding site': 'BINDING',
  'Active site': 'ACT_SITE',
  'Metal binding': 'METAL',
  'Modified residue': 'MOD_RES',
  'Disulfide bond': 'DISULFID',
  'Beta strand': 'STRAND',
  Helix: 'HELIX',
  Turn: 'TURN',
  'Coiled coil': 'COILED',
});

export class AnnotationUnavailableError extends Error {
  constructor() {
    super('Protein annotations are temporarily unavailable. Local experimental data is still available.');
    this.name = 'AnnotationUnavailableError';
  }
}

export function validAnnotationPayload(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && value.available !== false && Array.isArray(value.features)
    && value.features.every(feature => feature !== null && typeof feature === 'object'
      && typeof feature.type === 'string')
    && (value.sequence === undefined || typeof value.sequence === 'string');
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  // Keep the deadline active while consuming the body as well as receiving headers.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Annotation provider returned HTTP ${response.status}`);
    }
    const type = response.headers.get('content-type') || '';
    if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(type)) {
      await response.body?.cancel();
      throw new Error('Annotation provider returned a non-JSON response');
    }
    try {
      return await response.json();
    } catch {
      throw new Error('Annotation provider returned invalid JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

function legacyFeatures(entry, accession) {
  if (typeof entry?.primaryAccession !== 'string'
      || (entry.secondaryAccessions !== undefined && !Array.isArray(entry.secondaryAccessions))) {
    throw new Error('UniProt returned an invalid accession');
  }
  const accessions = [entry.primaryAccession, ...(entry.secondaryAccessions || [])];
  if (!accessions.includes(accession) || typeof entry?.sequence?.value !== 'string'
      || !entry.sequence.value || (entry.features !== undefined && !Array.isArray(entry.features))) {
    throw new Error('UniProt returned an invalid protein entry');
  }
  const features = (entry.features || []).map(feature => {
    if (feature === null || typeof feature !== 'object' || typeof feature.type !== 'string') {
      throw new Error('UniProt returned an invalid feature');
    }
    const converted = {
      ...feature,
      type: Object.hasOwn(FEATURE_TYPES, feature.type) ? FEATURE_TYPES[feature.type] : feature.type,
    };
    const start = feature.location?.start?.value;
    const end = feature.location?.end?.value;
    if (Number.isInteger(start) && start > 0 && Number.isInteger(end) && end >= start) {
      converted.begin = start;
      converted.end = end;
    }
    return converted;
  });
  return {
    accession: entry.primaryAccession,
    sequence: entry.sequence.value,
    features,
    source: 'UniProtKB',
  };
}

export async function fetchProteinAnnotations(accession, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const encoded = encodeURIComponent(accession);
  try {
    const payload = await fetchJson(EBI_FEATURES_URL + encoded, fetchImpl, timeoutMs);
    if (!validAnnotationPayload(payload)
        || (payload.accession !== undefined && payload.accession !== accession)) {
      throw new Error('EBI returned invalid protein annotations');
    }
    return payload;
  } catch {
    // UniProtKB provides the same public sequence annotations in another JSON shape.
    // Its conversion preserves original feature metadata and only adds known coordinates.
  }
  try {
    const entry = await fetchJson(UNIPROT_ENTRY_URL + encoded + '.json', fetchImpl, timeoutMs);
    return legacyFeatures(entry, accession);
  } catch {
    throw new AnnotationUnavailableError();
  }
}
