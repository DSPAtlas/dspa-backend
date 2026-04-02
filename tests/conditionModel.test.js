import { test } from 'node:test';
import assert from 'node:assert';
import { combineProteinScores } from '../models/conditionModel.js';

test('combineProteinScores groups protein scores across experiments and computes averages', () => {
  const proteinScoresList = [
    {
      experimentID: 'EXP-001',
      data: [
        { proteinAccession: 'P12345', score: 2 },
        { proteinAccession: 'Q67890', score: 6 }
      ]
    },
    {
      experimentID: 'EXP-002',
      data: [
        { proteinAccession: 'P12345', score: 4 },
        { proteinAccession: 'Q67890', score: 2 }
      ]
    }
  ];

  const result = combineProteinScores(proteinScoresList);
  const proteinByAccession = Object.fromEntries(
    result.map((entry) => [entry.proteinAccession, entry])
  );

  assert.deepStrictEqual(Object.keys(proteinByAccession).sort(), ['P12345', 'Q67890']);
  assert.strictEqual(proteinByAccession.P12345.averageScore, 3);
  assert.deepStrictEqual(proteinByAccession.P12345.details, [
    { experimentID: 'EXP-001', score: 2 },
    { experimentID: 'EXP-002', score: 4 }
  ]);
  assert.strictEqual(proteinByAccession.Q67890.averageScore, 4);
  assert.deepStrictEqual(proteinByAccession.Q67890.details, [
    { experimentID: 'EXP-001', score: 6 },
    { experimentID: 'EXP-002', score: 2 }
  ]);
});

test('combineProteinScores returns an empty array when no experiment scores are provided', () => {
  assert.deepStrictEqual(combineProteinScores([]), []);
});