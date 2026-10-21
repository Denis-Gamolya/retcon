import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGameHandler } from '../game/netlify-handler.mjs';
import { conditionalStore } from './helpers/conditional-store.mjs';
import { client, completeGame } from './helpers/game-session.mjs';

test('stateless functions complete a three-round game with correct scoring and a final winner', async () => {
  const store = conditionalStore();
  // Construct a new handler for every request to simulate unrelated cold starts.
  const result = await completeGame((request) => createGameHandler({ store, totalRounds: 3 })(request), 3);
  const repeated = await result.post('action', { action: 'next', round: 3 }, result.guest);
  assert.equal(repeated.status, 400);
  const after = (await result.post('state', {}, result.host)).body;
  assert.deepEqual(after.players, result.final.players);
});

test('concurrent joins and submissions survive conditional-write conflicts without lost updates', async () => {
  const store = conditionalStore({ conflicts: 2 });
  const handle = (request) => createGameHandler({ store })(request);
  const post = client(handle);
  const id = randomUUID();
  const created = await Promise.all([post('create', { name: 'Host' }, null, id), post('create', { name: 'Host' }, null, id)]);
  assert.deepEqual(created[0].body, created[1].body);
  const host = created[0].body;
  const joined = await Promise.all(Array.from({ length: 7 }, (_, index) => post('join', { code: host.code, name: `Guest ${index}` })));
  assert.ok(joined.every((result) => result.status === 200));
  const players = [host, ...joined.map((result) => result.body)];
  assert.equal((await post('state', {}, host)).body.players.length, 8);
  assert.equal((await post('action', { action: 'start' }, host)).status, 200);
  const submitId = randomUUID();
  const drawing = { action: 'drawing', round: 1, strokes: [{ color: '#172033', width: 4, points: [[10, 10]] }], done: true };
  const results = await Promise.all([...players.map((player) => post('action', drawing, player, player === host ? submitId : undefined)), post('action', drawing, host, submitId)]);
  assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
  const state = (await post('state', {}, host)).body;
  assert.equal(state.phase, 'claim');
  assert.equal(state.me.lockedSlot, 'action');
  assert.equal(state.me.strokes.length, 1);
  const claims = await Promise.all(players.map(async (player) => {
    const own = (await post('state', {}, player)).body;
    return post('action', { action: 'claim', round: 1, claim: own.me.original }, player);
  }));
  assert.ok(claims.every((result) => result.status === 200));
  await Promise.all(players.map(async (player) => {
    for (const other of players.filter((member) => member !== player)) {
      assert.equal((await post('action', { action: 'vote', round: 1, targetId: other.playerId, truth: true }, player)).status, 200);
    }
    assert.equal((await post('action', { action: 'finish-votes', round: 1 }, player)).status, 200);
  }));
  const reveal = (await post('state', {}, host)).body;
  assert.equal(reveal.phase, 'reveal');
  assert.ok(reveal.players.every((player) => player.score === 5600));
  for (let index = 0; index < 3; index++) assert.equal((await post('state', {}, host)).body.players[0].score, 5600);
});

test('stored deadlines advance and score once after all function processes disappear', async () => {
  let time = 1000;
  const store = conditionalStore();
  const post = client((request) => createGameHandler({ store, now: () => time })(request));
  const host = (await post('create', { name: 'Host' })).body;
  await post('join', { code: host.code, name: 'Guest' });
  await post('action', { action: 'start' }, host);
  await post('action', { action: 'drawing', round: 1, strokes: [{ color: '#172033', width: 4, points: [[1, 1]] }] }, host);
  time += 150001;
  const revealed = (await post('state', {}, host)).body;
  assert.equal(revealed.phase, 'reveal');
  assert.ok(revealed.players.every((player) => player.score === 0));
  assert.equal((await post('state', {}, host)).body.version, revealed.version);
});

test('requests retain privacy, enforce origin and token checks, and reject invalid input', async () => {
  const post = client(createGameHandler({ store: conditionalStore() }));
  const host = (await post('create', { name: 'Host' })).body;
  const guest = (await post('join', { code: host.code, name: 'Guest' })).body;
  const joinId = randomUUID();
  const firstJoin = await post('join', { code: host.code, name: 'Retry' }, null, joinId);
  assert.deepEqual((await post('join', { code: host.code, name: 'Retry' }, null, joinId)).body, firstJoin.body);
  assert.equal((await post('state', {}, { ...host, token: 'wrong' })).status, 401);
  assert.equal((await post('state', {}, { ...host, code: 'ZZZZZZ' })).status, 404);
  await post('action', { action: 'start' }, host);
  const state = (await post('state', {}, guest)).body;
  assert.equal(state.players[0].token, undefined);
  assert.equal(state.players[0].entry, undefined);
  assert.deepEqual(state.gallery, []);
  const unchanged = await post('state', { since: state.version }, guest);
  assert.equal(unchanged.body.unchanged, true);
  const handle = createGameHandler({ store: conditionalStore() });
  assert.equal((await handle(new Request('http://localhost/.netlify/functions/game', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}',
  }))).status, 403);
});
