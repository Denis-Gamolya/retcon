import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingScoreDetails } from '../web/scoring.mjs';

const names = (id) => ({ me: 'Alex', other: 'Sam' })[id];

test('correct guesses show only the choice and 500 points', () => {
  for (const truth of [true, false]) {
    const [detail] = drawingScoreDetails({ playerId: 'other', truth, votes: [{ playerId: 'me', truth, correct: true }] }, 'me', names);
    assert.equal(detail.points, 500);
    assert.equal(detail.choice, truth ? 'Truth' : 'Lie');
    assert.equal(detail.playerName, null);
    assert.equal(detail.outcome, 'Correct');
  }
});

test('incorrect and missing guesses explicitly award zero', () => {
  const [wrong] = drawingScoreDetails({ playerId: 'other', truth: false, votes: [{ playerId: 'me', truth: true, correct: false }] }, 'me', names);
  assert.equal(wrong.points, 0);
  assert.equal(wrong.choice, 'Truth');
  assert.equal(wrong.outcome, 'Wrong');
  const [missing] = drawingScoreDetails({ playerId: 'other', truth: true, votes: [{ playerId: 'me', truth: null }] }, 'me', names);
  assert.equal(missing.points, 0);
  assert.equal(missing.choice, 'No vote');
});

test('Truth votes show 300 points and the voter name for original or altered prompts', () => {
  for (const truth of [true, false]) {
    const [detail] = drawingScoreDetails({ playerId: 'me', truth, votes: [{ playerId: 'other', truth: true }] }, 'me', names);
    assert.equal(detail.points, 300);
    assert.equal(detail.choice, 'Truth');
    assert.equal(detail.playerName, 'Sam');
    assert.equal(detail.outcome, truth ? 'Believed' : 'Fooled');
  }
});

test('Lie votes and missing votes award the author zero regardless of the claim', () => {
  for (const truth of [true, false]) {
    const details = drawingScoreDetails({ playerId: 'me', truth, votes: [{ playerId: 'other', truth: false }, { playerId: 'other', truth: null }] }, 'me', names);
    assert.deepEqual(details.map((detail) => detail.points), [0, 0]);
    assert.equal(details[0].choice, 'Lie');
    assert.equal(details[1].choice, 'No vote');
    assert.equal(details[0].outcome, truth ? 'Doubted' : 'Caught');
    assert.equal(details[1].outcome, '');
    assert.ok(details.every((detail) => detail.playerName === 'Sam'));
  }
});
