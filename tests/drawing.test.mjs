import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSpans, drawStroke } from '../web/drawing.mjs';
import { validateDrawing } from '../game/engine.mjs';

test('bucket fills a connected area without crossing an enclosing border', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let row = 1; row < 4; row++) {
    for (let column = 1; column < 4; column++) {
      if (row === 2 && column === 2) continue;
      pixels.fill(0, (row * 5 + column) * 4, (row * 5 + column) * 4 + 3);
    }
  }
  assert.deepEqual(fillSpans(pixels, 5, 5, 2, 2), [[2, 2, 3]]);
  const outside = fillSpans(pixels, 5, 5, 0, 0);
  assert.equal(outside.reduce((total, [, left, right]) => total + right - left, 0), 16);
  assert.throws(() => fillSpans(pixels, 5, 5, 0, 0, 1), /complex/);
});

test('bucket handles the full canvas and taps on the canvas edge', () => {
  const pixels = new Uint8ClampedArray(800 * 500 * 4).fill(255);
  const spans = fillSpans(pixels, 800, 500, 800, 500);
  assert.equal(spans.length, 500);
  assert.ok(spans.every(([, left, right]) => left === 0 && right === 800));
});

test('brush size, opacity and bucket commands survive server validation', () => {
  const commands = [
    { color: '#172033', width: 23, opacity: 0.42, points: [[0, 0], [800, 500]] },
    { type: 'fill', color: '#7057ff', opacity: 0.6, spans: [[2, 3, 800]] },
  ];
  assert.deepEqual(validateDrawing(commands), commands);
  for (const invalid of [
    { ...commands[0], width: 65 },
    { ...commands[0], opacity: NaN },
    { ...commands[1], spans: [[500, 0, 800]] },
    { ...commands[1], spans: [[0, 8, 3]] },
    { ...commands[1], spans: Array(12001).fill([0, 0, 1]) },
  ]) assert.throws(() => validateDrawing([invalid]));
});

test('replaying translucent fills applies opacity once and restores canvas state', () => {
  const calls = [];
  const context = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    fillRect(...coordinates) { calls.push([this.globalAlpha, ...coordinates]); },
  };
  drawStroke(context, { type: 'fill', color: '#7057ff', opacity: 0.4, spans: [[1, 2, 5]] });
  assert.deepEqual(calls, ['save', [0.4, 2, 1, 3, 1], 'restore']);
});

test('new palette colors are accepted for brushes and bucket fills', () => {
  for (const color of ['#e53935', '#f4d438', '#24bfd1', '#3478e5', '#915c38']) {
    const commands = [
      { color, width: 4, points: [[10, 10]] },
      { type: 'fill', color, opacity: 0.5, spans: [[10, 0, 800]] },
    ];
    assert.deepEqual(validateDrawing(commands), commands);
  }
});
