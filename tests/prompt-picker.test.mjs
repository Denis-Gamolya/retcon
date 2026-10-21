import test from 'node:test';
import assert from 'node:assert/strict';
import { wordPage } from '../web/prompt-picker.mjs';
import { vocabulary } from '../game/vocabulary.mjs';

test('initial suggestions belong to the original visual family', () => {
  for (const entries of Object.values(vocabulary)) {
    for (const original of entries) {
      const result = wordPage(entries, { originalId: original.id });
      assert.ok(result.entries.length > 0 && result.entries.length <= 8);
      assert.ok(result.entries.every((entry) => entry.family === original.family));
    }
  }
});

test('search ignores case and surrounding spaces and can cross families', () => {
  const entries = vocabulary.object;
  const originalId = entries[0].id;
  const chosen = entries.find((entry) => entry.family !== entries[0].family);
  const result = wordPage(entries, { originalId, query: `  ${chosen.label.toUpperCase()}  ` });
  assert.ok(result.entries.some((entry) => entry.id === chosen.id));
  const family = wordPage(entries, { originalId, query: chosen.family });
  assert.ok(family.entries.some((entry) => entry.family === chosen.family));
  assert.equal(wordPage(entries, { originalId, query: 'not-a-real-word-123' }).total, 0);
});

test('family browsing and broad searches paginate without omissions or duplicates', () => {
  const entries = vocabulary.object;
  for (const options of [{ query: 'a' }, ...[...new Set(entries.map((entry) => entry.family))].map((family) => ({ family }))]) {
    const first = wordPage(entries, { ...options, originalId: entries[0].id });
    const found = [];
    for (let page = 0; page < first.pages; page++) {
      const result = wordPage(entries, { ...options, originalId: entries[0].id, page });
      assert.ok(result.entries.length <= 8);
      found.push(...result.entries.map((entry) => entry.id));
    }
    assert.equal(found.length, first.total);
    assert.equal(new Set(found).size, first.total);
    assert.equal(wordPage(entries, { ...options, originalId: entries[0].id, page: 999 }).page, first.pages - 1);
  }
});
