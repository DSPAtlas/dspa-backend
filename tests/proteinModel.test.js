import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processExperimentData } from '../models/proteinModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (...parts) => path.join(__dirname, 'fixtures', ...parts);

const readTsv = (filePath) => {
  const [headerLine, ...lines] = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = headerLine.split('\t');

  return lines.map(line => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
};

const readScoreInputFixture = () => readTsv(fixturePath('o13297_reference_score_input.tsv')).map(row => ({
  pg_protein_accessions: row.pg_protein_accessions,
  pos_start: Number(row.pos_start),
  pos_end: Number(row.pos_end),
  diff: Number(row.diff),
  adj_pval: Number(row.adj_pval)
}));

test('processExperimentData matches R-style inclusive 1-based overlapping fragments', () => {
  // Short protein of 4 amino acids: "ABCD" (biological residues 1, 2, 3, 4)
  // Two fragments of 3 amino acids each, overlapping in the middle (residues 2 and 3)
  const data = [
    { pg_protein_accessions: 'P1', pos_start: 1, pos_end: 3, diff: 1.0, adj_pval: 0.01 }, // score = 2 + 1 = 3
    { pg_protein_accessions: 'P1', pos_start: 2, pos_end: 4, diff: 3.0, adj_pval: 0.01 }  // score = 2 + 3 = 5
  ];
  const sequence = "ABCD";

  const result = processExperimentData(data, sequence);

  assert.strictEqual(result.length, 4, 'Result length should equal max 1-based residue position');

  // Residue 1: only fragment 1. avg = 3. Normalized: (3 - 3) / (5 - 3) = 0.0
  assert.strictEqual(result[0].index, 1);
  assert.strictEqual(result[0].residue, 1);
  assert.strictEqual(result[0].aminoacid, 'A');
  assert.strictEqual(result[0].detected, 1);
  assert.strictEqual(result[0].sig, 1);
  assert.strictEqual(result[0].amino_acid_score, 3.0);
  assert.strictEqual(result[0].score, 0.0);

  // Residue 2: fragments 1 & 2. avg = (3 + 5) / 2 = 4. Normalized = 0.5
  assert.strictEqual(result[1].index, 2);
  assert.strictEqual(result[1].residue, 2);
  assert.strictEqual(result[1].aminoacid, 'B');
  assert.strictEqual(result[1].detected, 1);
  assert.strictEqual(result[1].sig, 1);
  assert.strictEqual(result[1].amino_acid_score, 4.0);
  assert.strictEqual(result[1].score, 0.5);

  // Residue 3: fragments 1 & 2. avg = 4. Normalized = 0.5
  assert.strictEqual(result[2].index, 3);
  assert.strictEqual(result[2].residue, 3);
  assert.strictEqual(result[2].aminoacid, 'C');
  assert.strictEqual(result[2].detected, 1);
  assert.strictEqual(result[2].sig, 1);
  assert.strictEqual(result[2].amino_acid_score, 4.0);
  assert.strictEqual(result[2].score, 0.5);

  // Residue 4: only fragment 2. avg = 5. Normalized = 1.0
  assert.strictEqual(result[3].index, 4);
  assert.strictEqual(result[3].residue, 4);
  assert.strictEqual(result[3].aminoacid, 'D');
  assert.strictEqual(result[3].detected, 1);
  assert.strictEqual(result[3].sig, 1);
  assert.strictEqual(result[3].amino_acid_score, 5.0);
  assert.strictEqual(result[3].score, 1.0);
});

test('processExperimentData handles uncovered positions and degenerate cases', () => {
  const data = [
    { pg_protein_accessions: 'P1', pos_start: 2, pos_end: 3, diff: 2.0, adj_pval: 0.05 }
  ];
  const sequence = "ABCD";

  const result = processExperimentData(data, sequence);

  // Residue 1: uncovered -> score null, sig/detected null
  assert.strictEqual(result[0].index, 1);
  assert.strictEqual(result[0].residue, 1);
  assert.strictEqual(result[0].aminoacid, 'A');
  assert.strictEqual(result[0].sig, null);
  assert.strictEqual(result[0].detected, null);
  assert.strictEqual(result[0].score, null);

  // Residues 2 and 3: degenerate (min=max) -> normalized score 1.0
  assert.strictEqual(result[1].index, 2);
  assert.strictEqual(result[1].residue, 2);
  assert.strictEqual(result[1].aminoacid, 'B');
  assert.strictEqual(result[1].sig, 1);
  assert.strictEqual(result[1].detected, 1);
  assert.strictEqual(result[1].score, 1.0);

  assert.strictEqual(result[2].index, 3);
  assert.strictEqual(result[2].residue, 3);
  assert.strictEqual(result[2].aminoacid, 'C');
  assert.strictEqual(result[2].sig, 1);
  assert.strictEqual(result[2].detected, 1);
  assert.strictEqual(result[2].score, 1.0);
});

test('processExperimentData reproduces R-computed O13297 amino acid scores from TSV fixture', () => {
  const inputRows = readScoreInputFixture();
  const expectedRows = readTsv(fixturePath('o13297_reference_aa_scores.tsv'));
  const sequence = fs.readFileSync(fixturePath('o13297_sequence.txt'), 'utf8').trim();

  const result = processExperimentData(inputRows, sequence);

  for (const expected of expectedRows) {
    const residue = Number(expected.residue);
    const actual = result[residue - 1];
    const expectedAminoAcidScore = Number(expected.amino_acid_score);
    const expectedNormalizedScore = Number(expected.amino_acid_score_normalized);

    assert.ok(actual, `Missing result for residue ${residue}`);
    assert.strictEqual(actual.index, residue);
    assert.strictEqual(actual.residue, residue);
    assert.strictEqual(actual.aminoacid, sequence[residue - 1]);
    assert.strictEqual(actual.detected, 1);
    assert.strictEqual(actual.sig, 1);
    assert.strictEqual(
      actual.amino_acid_score,
      expectedAminoAcidScore,
      `Raw amino acid score mismatch at residue ${residue}`
    );
    assert.ok(
      Math.abs(actual.amino_acid_score_normalized - expectedNormalizedScore) <= Number.EPSILON * 16,
      `Normalized amino acid score mismatch at residue ${residue}: expected ${expectedNormalizedScore}, got ${actual.amino_acid_score_normalized}`
    );
    assert.strictEqual(actual.score, actual.amino_acid_score_normalized);
  }

  const coveredResidues = result.filter(row => row.detected === 1);
  assert.strictEqual(coveredResidues.length, expectedRows.length);
});
