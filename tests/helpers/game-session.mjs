import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { vocabulary } from '../../game/vocabulary.mjs';

export function client(handle) {
  return async (op, payload = {}, player = null, requestId = randomUUID()) => {
    const response = await handle(new Request('http://localhost/.netlify/functions/game', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(player ? { Authorization: `Bearer ${player.token}` } : {}) },
      body: JSON.stringify({ op, room: player?.code ?? payload.code, ...payload, requestId }),
    }));
    return { status: response.status, body: await response.json(), requestId };
  };
}

/** Exercise full rounds through HTTP-shaped requests, ending with one winner. */
export async function completeGame(handle, rounds) {
  const post = client(handle);
  const host = (await post('create', { name: 'Host' })).body;
  const guest = (await post('join', { code: host.code, name: 'Guest' })).body;
  const players = [host, guest];
  const act = async (player, action, round, extra = {}) => {
    const result = await post('action', { action, round, ...extra }, player);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  await act(host, 'start', 0);
  let final;
  for (let round = 1; round <= rounds; round++) {
    for (const player of players) await act(player, 'drawing', round, { strokes: [{ color: '#172033', width: 4, points: [[10, 10], [40, 40]] }], done: true });
    const original = (await post('state', {}, host)).body.me.original;
    const lie = { ...original, object: vocabulary.object.find((word) => word.id !== original.object).id };
    await act(host, 'claim', round, { claim: lie });
    const guestState = (await post('state', {}, guest)).body;
    assert.equal(guestState.me.lockedSlot, 'action');
    assert.equal(guestState.gallery.length, 0);
    await act(guest, 'claim', round, { claim: guestState.me.original });
    await act(host, 'vote', round, { targetId: guest.playerId, truth: true });
    await act(guest, 'vote', round, { targetId: host.playerId, truth: true });
    await act(host, 'finish-votes', round);
    const reveal = await act(guest, 'finish-votes', round);
    assert.equal(reveal.phase, 'reveal');
    assert.deepEqual(reveal.result.gains[host.playerId], { judging: 500, belief: 300 });
    assert.deepEqual(reveal.result.gains[guest.playerId], { judging: 0, belief: 300 });
    final = await act(host, 'next', round);
  }
  assert.equal(final.phase, 'finished');
  assert.equal(final.history.length, rounds);
  assert.equal(final.totalRounds, rounds);
  assert.deepEqual(final.winners, [host.playerId]);
  assert.equal(final.players.find((player) => player.id === host.playerId).score, 800 * rounds);
  assert.equal(final.players.find((player) => player.id === guest.playerId).score, 300 * rounds);
  return { post, host, guest, final };
}
