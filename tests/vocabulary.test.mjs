import test from 'node:test';
import assert from 'node:assert/strict';
import { vocabulary, validateClaim, phrase } from '../game/vocabulary.mjs';

function word(slot, label) {
  const entry = vocabulary[slot].find((candidate) => candidate.label === label);
  assert.ok(entry, `Missing ${slot}: ${label}`);
  return entry;
}

test('library entries are unique, grammatical fragments with usable visual families', () => {
  for (const [slot, entries] of Object.entries(vocabulary)) {
    assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
    assert.equal(new Set(entries.map((entry) => entry.label.toLowerCase())).size, entries.length);
    const families = new Map();
    for (const entry of entries) {
      assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(entry.label, entry.label.trim());
      assert.match(entry.label, slot === 'action' ? /^is / : slot === 'character' ? /^An? / : /^an? /);
      assert.ok(entry.family.trim());
      families.set(entry.family, (families.get(entry.family) ?? 0) + 1);
    }
    for (const [family, count] of families) {
      assert.ok(count >= 3, `${family} needs multiple visual substitutes`);
    }
  }
});

test('visual families connect recognizable shapes across semantic categories', () => {
  const examples = {
    object: [
      ['a doughnut', 'a tire', 'a life ring'],
      ['an umbrella', 'a mushroom', 'a table lamp'],
      ['a pizza', 'a plate', 'a clock'],
      ['a balloon', 'a magnifying glass', 'a microphone'],
      ['a banana', 'a crescent moon', 'a boomerang'],
      ['a guitar', 'a violin', 'a banjo'],
      ['a house', 'a doghouse', 'a barn'],
      ['a top hat', 'a helmet', 'a sombrero'],
    ],
    character: [
      ['A cat', 'A fox', 'A dog'],
      ['A wizard', 'A witch', 'A princess'],
      ['An astronaut', 'A diver', 'A robot'],
      ['A dinosaur', 'A dragon', 'A crocodile'],
      ['A turtle', 'A snail', 'An armadillo'],
      ['A butterfly', 'A bee', 'A ladybug'],
      ['A clown', 'A jester', 'A mime'],
    ],
  };
  for (const [slot, groups] of Object.entries(examples)) {
    for (const labels of groups) {
      assert.equal(new Set(labels.map((label) => word(slot, label).family)).size, 1);
    }
  }
});

test('new visual substitutes form valid claims while the locked action stays fixed', () => {
  const original = {
    character: word('character', 'A cat').id,
    action: word('action', 'is carrying').id,
    object: word('object', 'an umbrella').id,
  };
  const claim = {
    character: word('character', 'A dog').id,
    action: original.action,
    object: word('object', 'a mushroom').id,
  };
  assert.deepEqual(validateClaim(original, claim, 'action'), claim);
  assert.equal(phrase(claim), 'A dog is carrying a mushroom');
  assert.throws(() => validateClaim(original, { ...claim, object: claim.character }, 'action'), /valid object/);
});
