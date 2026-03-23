import { test } from 'node:test';
import assert from 'node:assert';
import { processExperimentData } from '../models/proteinModel.js';

test('processExperimentData processes overlapping fragments correctly', () => {
  // Short protein of 4 amino acids: "ABCD" (indices 0, 1, 2, 3)
  // Two fragments of 3 amino acids each, overlapping in the middle (indices 1 and 2)
  const data = [
    { pos_start: 0, pos_end: 3, diff: 1.0, adj_pval: 0.01 }, // covers indices 0, 1, 2
    { pos_start: 1, pos_end: 4, diff: 3.0, adj_pval: 0.01 }  // covers indices 1, 2, 3
  ];
  const sequence = "ABCD";

  const result = processExperimentData(data, sequence);

  // Max pos_end is 4, so result array length will be 5 (indices 0 to 4)
  assert.strictEqual(result.length, 5, 'Result length should be max pos_end + 1');

  // Index 0: only fragment 1. sum = 1.0, count = 1 -> avg = 1.0
  // Normalization: min avg = 1.0, max avg = 3.0
  // Normalized: (1.0 - 1.0) / (3.0 - 1.0) = 0.0
  assert.strictEqual(result[0].aminoacid, 'A');
  assert.strictEqual(result[0].detected, 1);
  assert.strictEqual(result[0].sig, 1);
  assert.strictEqual(result[0].score, 0.0);

  // Index 1: fragment 1 & 2. sum = 1.0 + 3.0 = 4.0, count = 2 -> avg = 2.0
  // Normalized: (2.0 - 1.0) / 2.0 = 0.5
  assert.strictEqual(result[1].aminoacid, 'B');
  assert.strictEqual(result[1].detected, 1);
  assert.strictEqual(result[1].sig, 1);
  assert.strictEqual(result[1].score, 0.5);

  // Index 2: fragment 1 & 2. sum = 1.0 + 3.0 = 4.0, count = 2 -> avg = 2.0
  // Normalized: (2.0 - 1.0) / 2.0 = 0.5
  assert.strictEqual(result[2].aminoacid, 'C');
  assert.strictEqual(result[2].detected, 1);
  assert.strictEqual(result[2].sig, 1);
  assert.strictEqual(result[2].score, 0.5);

  // Index 3: only fragment 2. sum = 3.0, count = 1 -> avg = 3.0
  // Normalized: (3.0 - 1.0) / 2.0 = 1.0
  assert.strictEqual(result[3].aminoacid, 'D');
  assert.strictEqual(result[3].detected, 1);
  assert.strictEqual(result[3].sig, 1);
  assert.strictEqual(result[3].score, 1.0);

  // Index 4: out of bounds for sequence "ABCD" (empty string), but tracked due to pos_end=4
  assert.strictEqual(result[4].aminoacid, '');
  assert.strictEqual(result[4].sig, null);
  assert.strictEqual(result[4].detected, null);
  assert.strictEqual(result[4].score, 0.5); // Default score for avg === null
});

test('processExperimentData handles uncovered positions and degenerate cases', () => {
  const data = [
    { pos_start: 1, pos_end: 3, diff: 2.0, adj_pval: 0.05 } // covers indices 1, 2
  ];
  const sequence = "ABCD";

  const result = processExperimentData(data, sequence);

  // Index 0: uncovered -> score 0.5, sig/detected null
  assert.strictEqual(result[0].sig, null);
  assert.strictEqual(result[0].detected, null);
  assert.strictEqual(result[0].score, 0.5);

  // Index 1: degenerate (min=max=2) -> score 0.5
  assert.strictEqual(result[1].sig, 1);
  assert.strictEqual(result[1].detected, 1);
  assert.strictEqual(result[1].score, 0.5);

  // Index 2: degenerate -> score 0.5
  assert.strictEqual(result[2].sig, 1);
  assert.strictEqual(result[2].detected, 1);
  assert.strictEqual(result[2].score, 0.5);
});