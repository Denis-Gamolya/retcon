import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../game/engine.mjs';
import { promptChoices, vocabulary } from '../game/vocabulary.mjs';
import { createGameHandler } from '../game/netlify-handler.mjs';
import { conditionalStore } from './helpers/conditional-store.mjs';
import { client } from './helpers/game-session.mjs';

const sketch = [{ color: '#172033', width: 8, points: [[100, 100], [200, 200]] }];

function lobby(count = 4) {
  const engine = new GameEngine({ now: () => 1000 });
  const { room, player: host } = engine.create('Host');
  const players = [host];
  for (let index = 1; index < count; index++) players.push(engine.join(room.code, `Guest ${index}`).player);
  for (const player of players) engine.setConnected(room, player, true);
  return { engine, room, host, players };
}

test('lobby settings are host-only, validated, and fixed during active games', () => {
  const { engine, room, host, players } = lobby();
  assert.throws(() => engine.action(room, players[1], 'settings', { settings: { rounds: 3 } }), /host/);
  for (const settings of [{ rounds: 100 }, { drawSeconds: -1 }, { wordPool: 'unknown' }, { revealMode: 'unknown' }, { extra: true }]) {
    assert.throws(() => engine.action(room, host, 'settings', { settings }), /supported/);
  }
  engine.action(room, host, 'settings', { settings: { rounds: 3, drawSeconds: 30, wordPool: 'familiar', revealMode: 'guided' } });
  engine.start(room, host);
  assert.equal(room.deadline, 31000);
  assert.equal(engine.view(room, host).totalRounds, 3);
  assert.throws(() => engine.action(room, host, 'settings', { settings: { rounds: 5 } }), /lobby/);
});

test('portraits are public, bounded vectors and survive new games and rematches', () => {
  const { engine, room, host, players } = lobby(2);
  engine.action(room, host, 'avatar', { strokes: sketch });
  assert.deepEqual(engine.view(room, players[1]).players[0].avatar, sketch);
  assert.throws(() => engine.action(room, host, 'avatar', { strokes: Array(61).fill(sketch[0]) }), /60/);
  assert.throws(() => engine.action(room, host, 'avatar', { strokes: [{ ...sketch[0], points: Array(1501).fill([10, 10]) }] }), /1,500/);
  assert.throws(() => engine.action(room, host, 'avatar', { strokes: [{ type: 'fill', color: '#172033', spans: [[0, 0, 800]] }] }), /1,500/);
  engine.start(room, host);
  assert.throws(() => engine.action(room, host, 'avatar', { strokes: [] }), /lobby/);
  assert.deepEqual(host.avatar, sketch);
  room.phase = 'finished';
  engine.action(room, host, 'rematch');
  assert.deepEqual(host.avatar, sketch);
});

test('recent character and object terms are avoided, including rerolls in familiar mode', () => {
  const { engine, room, host } = lobby(8);
  engine.action(room, host, 'settings', { settings: { wordPool: 'familiar' } });
  engine.start(room, host);
  for (const slot of ['character', 'object']) {
    assert.equal(new Set(room.players.map((player) => player.entry.original[slot])).size, 8);
    assert.ok(room.players.every((player) => promptChoices(slot, 'familiar').some((word) => word.id === player.entry.original[slot])));
  }
  const recent = structuredClone(room.recentWords);
  const prompt = engine.pickPrompt(room);
  assert.ok(!recent.character.includes(prompt.character));
  assert.ok(!recent.object.includes(prompt.object));
  for (let index = 0; index < 300; index++) engine.pickPrompt(room);
  assert.equal(new Set(room.usedPrompts).size, room.usedPrompts.length);
  assert.equal(room.recentWords.character.length, 16);
  for (const slot of ['character', 'object']) {
    assert.ok(promptChoices(slot, 'familiar').length < vocabulary[slot].length);
    const families = Map.groupBy(promptChoices(slot, 'familiar'), (word) => word.family);
    assert.ok([...families.values()].every((family) => family.length >= 3));
  }
});

test('four players finish three guided rounds with scores awarded only once', () => {
  const { engine, room, host, players } = lobby();
  engine.action(room, host, 'settings', { settings: { rounds: 3, revealMode: 'guided' } });
  engine.start(room, host);
  for (let round = 1; round <= 3; round++) {
    const act = (player, action, extra = {}) => engine.action(room, player, action, { round, gameId: room.gameId, ...extra });
    for (const player of players) act(player, 'drawing', { strokes: sketch, done: true });
    for (const player of players) act(player, 'claim', { claim: { ...player.entry.original } });
    for (const player of players) {
      for (const target of engine.targets(room, player)) act(player, 'vote', { targetId: target.id, truth: true });
      act(player, 'finish-votes');
    }
    assert.equal(room.phase, 'reveal');
    assert.throws(() => act(host, 'next'), /Reveal every/);
    assert.throws(() => act(players[1], 'reveal-next', { step: 0 }), /host/);
    const scores = players.map((player) => player.score);
    for (let step = 0; step < 11; step++) {
      act(host, 'reveal-next', { step });
      assert.equal(engine.view(room, players[1]).revealStep, step + 1);
      assert.throws(() => act(host, 'reveal-next', { step }), /already/);
      assert.deepEqual(players.map((player) => player.score), scores);
    }
    act(host, 'next');
  }
  assert.equal(room.phase, 'finished');
  assert.ok(players.every((player) => player.score === 7200));
  assert.equal(engine.view(room, host).winners.length, 4);
});

test('settings, portraits, and guided reveal position survive stateless requests', async () => {
  const store = conditionalStore();
  const post = client((request) => createGameHandler({ store })(request));
  const host = (await post('create', { name: 'Host' })).body;
  const guest = (await post('join', { code: host.code, name: 'Guest' })).body;
  assert.equal((await post('action', { action: 'settings', settings: { rounds: 3, revealMode: 'guided' } }, host)).status, 200);
  assert.equal((await post('action', { action: 'avatar', strokes: sketch }, host)).status, 200);
  const view = (await post('state', {}, guest)).body;
  assert.equal(view.totalRounds, 3);
  assert.equal(view.settings.revealMode, 'guided');
  assert.deepEqual(view.players[0].avatar, sketch);
  const act = async (player, action, extra = {}) => {
    const response = await post('action', { action, round: 1, ...extra }, player);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };
  await act(host, 'start');
  for (const player of [host, guest]) await act(player, 'drawing', { strokes: sketch, done: true });
  for (const player of [host, guest]) {
    const current = (await post('state', {}, player)).body;
    await act(player, 'claim', { claim: current.me.original });
  }
  for (const [player, target] of [[host, guest], [guest, host]]) {
    await act(player, 'vote', { targetId: target.playerId, truth: true });
    await act(player, 'finish-votes');
  }
  await act(host, 'reveal-next', { step: 0 });
  assert.equal((await post('state', {}, guest)).body.revealStep, 1);
  const handler = createGameHandler({ store });
  const qr = await handler(new Request(`https://game.example/.netlify/functions/game?op=invite-qr&room=${host.code}`));
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /image\/svg/);
  assert.match(await qr.text(), /<svg/);
  const bad = await handler(new Request('https://game.example/.netlify/functions/game?op=invite-qr&room=%3Cscript%3E'));
  assert.equal(bad.status, 400);
});
