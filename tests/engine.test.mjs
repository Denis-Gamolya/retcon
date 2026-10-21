import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, timing, validateDrawing } from '../game/engine.mjs';
import { slots, vocabulary, validateClaim } from '../game/vocabulary.mjs';

const sketch = [{ color: '#172033', width: 4, points: [[10, 10], [100, 100]] }];

function party(count = 2) {
  let time = 0;
  const engine = new GameEngine({ now: () => time });
  const { room, player: host } = engine.create('Host');
  const players = [host];
  for (let index = 1; index < count; index += 1) players.push(engine.join(room.code, `Player ${index}`).player);
  for (const player of players) engine.setConnected(room, player, true);
  engine.start(room, host);
  return { engine, room, host, players, elapse: (milliseconds) => { time += milliseconds; engine.tick(room); } };
}

function submitDrawings(engine, room, players) {
  for (const player of players) engine.action(room, player, 'drawing', { round: room.round, strokes: sketch, done: true });
}

function falseClaim(entry) {
  const slot = slots.find((candidate) => candidate !== entry.lockedSlot);
  return { ...entry.original, [slot]: vocabulary[slot].find((choice) => choice.id !== entry.original[slot]).id };
}

test('approved timings are 60 / 30 / 60 seconds', () => {
  assert.deepEqual(timing, { draw: 60000, claim: 30000, judge: 60000 });
});

test('room capacity and nickname constraints are enforced', () => {
  const engine = new GameEngine();
  const { room, player } = engine.create('Host');
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.throws(() => engine.join(room.code, 'HOST'), /already in use/);
  assert.throws(() => engine.join(room.code, ''), /1–20/);
  assert.throws(() => engine.authenticate(room.code, 'bad token'), /expired/);
  for (let index = 1; index < 8; index += 1) engine.join(room.code, `P${index}`);
  assert.throws(() => engine.join(room.code, 'Extra'), /eight/);
  assert.throws(() => engine.start(room, player), /connected/);
});

test('drawing validation rejects oversized, malformed and unsupported input', () => {
  assert.deepEqual(validateDrawing(sketch), sketch);
  assert.throws(() => validateDrawing([{ ...sketch[0], points: [[NaN, 20]] }]), /coordinates/);
  assert.throws(() => validateDrawing([{ ...sketch[0], points: [[801, 20]] }]), /bounds/);
  assert.throws(() => validateDrawing([{ ...sketch[0], color: 'red' }]), /color/);
  assert.throws(() => validateDrawing(Array(251).fill(sketch[0])), /too many/);
});

test('private prompts, drafts and votes are never included in another player’s view', () => {
  const { engine, room, players } = party();
  const view = engine.view(room, players[0]);
  assert.equal(view.me.lockedSlot, null);
  assert.deepEqual(view.gallery, []);
  assert.equal(view.players[1].token, undefined);
  assert.equal(view.players[1].entry, undefined);
  assert.equal(view.result, null);
  submitDrawings(engine, room, players);
  engine.action(room, players[0], 'claim', { round: 1, claim: falseClaim(players[0].entry) });
  assert.deepEqual(engine.view(room, players[1]).gallery, []);
  engine.action(room, players[1], 'claim', { round: 1, claim: players[1].entry.original });
  engine.action(room, players[0], 'vote', { round: 1, targetId: players[1].id, truth: true });
  const judged = engine.view(room, players[1]);
  assert.deepEqual(judged.me.votes, {});
  assert.equal(judged.result, null);
  assert.equal(judged.gallery[0].original, undefined);
  assert.equal(judged.gallery[0].lockedSlot, undefined);
});

test('editing permits one or two valid slots, but no category swaps or locked changes', () => {
  const { engine, room, players } = party();
  submitDrawings(engine, room, players);
  const entry = players[0].entry;
  const valid = falseClaim(entry);
  assert.deepEqual(validateClaim(entry.original, valid, entry.lockedSlot), valid);
  const two = { ...valid };
  for (const slot of slots.filter((candidate) => candidate !== entry.lockedSlot)) two[slot] = vocabulary[slot].find((word) => word.id !== entry.original[slot]).id;
  assert.deepEqual(validateClaim(entry.original, two, entry.lockedSlot), two);
  assert.throws(() => validateClaim(entry.original, { ...valid, action: vocabulary.object[0].id }, entry.lockedSlot), /valid action/);
  const lockedChange = { ...valid, [entry.lockedSlot]: vocabulary[entry.lockedSlot].find((word) => word.id !== entry.original[entry.lockedSlot]).id };
  assert.throws(() => validateClaim(entry.original, lockedChange, entry.lockedSlot), /locked/);
  assert.throws(() => engine.action(room, players[0], 'drawing', { round: 1, strokes: sketch }), /over/);
});

test('claims keep the action while permitting character, object, both, or neither to change', () => {
  for (const changedSlots of [[], ['character'], ['object'], ['character', 'object']]) {
    const { engine, room, players } = party();
    submitDrawings(engine, room, players);
    const player = players[0];
    assert.equal(engine.view(room, player).me.lockedSlot, 'action');
    const claim = { ...player.entry.original };
    for (const slot of changedSlots) {
      claim[slot] = vocabulary[slot].find((word) => word.id !== claim[slot]).id;
    }
    const otherAction = vocabulary.action.find((word) => word.id !== claim.action).id;
    assert.throws(() => engine.action(room, player, 'claim', {
      round: room.round, claim: { ...claim, action: otherAction },
    }), /locked/);
    engine.action(room, player, 'claim', { round: room.round, claim });
    assert.deepEqual(player.entry.claim, claim);
  }
});

test('truth and lie belief bonuses coexist with correct-judgment scores', () => {
  const { engine, room, players } = party();
  submitDrawings(engine, room, players);
  engine.action(room, players[0], 'claim', { round: 1, claim: falseClaim(players[0].entry) });
  engine.action(room, players[1], 'claim', { round: 1, claim: players[1].entry.original });
  for (const player of players) {
    const target = players.find((other) => other !== player);
    engine.action(room, player, 'vote', { round: 1, targetId: target.id, truth: true });
    engine.action(room, player, 'finish-votes', { round: 1 });
  }
  assert.equal(room.phase, 'reveal');
  assert.equal(players[0].score, 800); // Correctly judged truth and sold a lie.
  assert.equal(players[1].score, 300); // Their truthful claim was believed.
  assert.equal(room.history[0].entries[0].truth, false);
  assert.throws(() => engine.action(room, players[0], 'vote', { round: 1, targetId: players[1].id, truth: false }), /over/);
  assert.equal(players[0].score, 800);
});

test('deadlines keep saved drawings, default missing claims to truth, and skip missing votes', () => {
  const { engine, room, players, elapse } = party();
  engine.action(room, players[0], 'drawing', { round: 1, strokes: sketch, done: false });
  elapse(60_000);
  assert.equal(room.phase, 'claim');
  assert.equal(players[0].entry.active, true);
  assert.equal(players[1].entry.active, false);
  elapse(30_000);
  assert.equal(room.phase, 'judge');
  assert.deepEqual(players[0].entry.claim, players[0].entry.original);
  elapse(60_000);
  assert.equal(room.phase, 'reveal');
  assert.deepEqual(players.map((player) => player.score), [0, 0]);
  assert.equal(room.history[0].entries[0].votes[0].truth, null);
});

test('a player without a drawing can judge and earn points', () => {
  const { engine, room, players } = party();
  engine.action(room, players[0], 'drawing', { round: 1, strokes: sketch, done: true });
  engine.action(room, players[1], 'drawing', { round: 1, strokes: [], done: true });
  engine.action(room, players[0], 'claim', { round: 1, claim: players[0].entry.original });
  engine.action(room, players[1], 'vote', { round: 1, targetId: players[0].id, truth: true });
  engine.action(room, players[1], 'finish-votes', { round: 1 });
  assert.equal(room.phase, 'reveal');
  assert.equal(players[0].score, 300);
  assert.equal(players[1].score, 500);
});

test('self-votes and stale round submissions are rejected', () => {
  const { engine, room, players } = party();
  submitDrawings(engine, room, players);
  for (const player of players) engine.action(room, player, 'claim', { round: 1, claim: player.entry.original });
  assert.throws(() => engine.action(room, players[0], 'vote', { round: 1, targetId: players[0].id, truth: true }), /another player/);
  assert.throws(() => engine.action(room, players[0], 'vote', { round: 0, targetId: players[1].id, truth: true }), /previous round/);
  assert.throws(() => engine.action(room, players[0], 'vote', { gameId: 'old-game', round: 1, targetId: players[1].id, truth: true }), /previous game/);
  assert.throws(() => engine.action(room, players[0], 'finish-votes', { round: 1 }), /every drawing/);
});

test('a locked drawing can be unlocked and edited before the drawing deadline', () => {
  const { engine, room, players, elapse } = party();
  const deadline = room.deadline;
  engine.action(room, players[0], 'drawing', { round: 1, strokes: sketch, done: true });
  engine.action(room, players[0], 'unlock-drawing', { round: 1 });
  assert.equal(players[0].entry.drawingDone, false);
  assert.deepEqual(players[0].entry.strokes, sketch);
  assert.equal(room.deadline, deadline);
  const edited = [...sketch, { ...sketch[0], points: [[200, 200]] }];
  engine.action(room, players[0], 'drawing', { round: 1, strokes: edited, done: true });
  assert.deepEqual(players[0].entry.strokes, edited);
  elapse(60_000);
  assert.throws(() => engine.action(room, players[0], 'unlock-drawing', { round: 1 }), /over/);
});

test('disconnecting an unready player stops blocking every timed phase', () => {
  const { engine, room, players } = party(3);
  submitDrawings(engine, room, players.slice(0, 2));
  engine.setConnected(room, players[2], false);
  assert.equal(room.phase, 'claim');
  for (const player of players.slice(0, 2)) engine.action(room, player, 'claim', { round: 1, claim: player.entry.original });
  assert.equal(room.phase, 'judge');
  for (const player of players.slice(0, 2)) {
    const target = players.find((other) => other !== player && other.connected);
    engine.action(room, player, 'vote', { round: 1, targetId: target.id, truth: true });
    engine.action(room, player, 'finish-votes', { round: 1 });
  }
  assert.equal(room.phase, 'reveal');
  assert.equal(players[2].score, 0);
  assert.equal(engine.authenticate(room.code, players[2].token).player.id, players[2].id);
});

test('claims and votes can be unlocked, changed, and relocked without resetting timers', () => {
  const { engine, room, players } = party();
  submitDrawings(engine, room, players);
  const claimDeadline = room.deadline;
  engine.action(room, players[0], 'claim', { round: 1, claim: falseClaim(players[0].entry) });
  engine.action(room, players[0], 'unlock-claim', { round: 1 });
  assert.equal(players[0].entry.claimDone, false);
  assert.equal(room.deadline, claimDeadline);
  engine.action(room, players[0], 'claim', { round: 1, claim: players[0].entry.original });
  engine.action(room, players[1], 'claim', { round: 1, claim: players[1].entry.original });
  assert.throws(() => engine.action(room, players[0], 'unlock-claim', { round: 1 }), /over/);
  const voteDeadline = room.deadline;
  engine.action(room, players[0], 'vote', { round: 1, targetId: players[1].id, truth: true });
  engine.action(room, players[0], 'finish-votes', { round: 1 });
  engine.action(room, players[0], 'unlock-votes', { round: 1 });
  assert.equal(players[0].entry.votesDone, false);
  assert.equal(players[0].entry.votes[players[1].id], true);
  assert.equal(room.deadline, voteDeadline);
  engine.action(room, players[0], 'vote', { round: 1, targetId: players[1].id, truth: false });
  engine.action(room, players[0], 'finish-votes', { round: 1 });
  engine.action(room, players[1], 'vote', { round: 1, targetId: players[0].id, truth: true });
  engine.action(room, players[1], 'finish-votes', { round: 1 });
  assert.equal(room.phase, 'reveal');
  assert.deepEqual(players.map((player) => player.score), [300, 500]);
  assert.throws(() => engine.action(room, players[0], 'unlock-votes', { round: 1 }), /over/);
});

test('expired claim and vote timers reject unlock requests', () => {
  const { engine, room, players, elapse } = party();
  submitDrawings(engine, room, players);
  engine.action(room, players[0], 'claim', { round: 1, claim: players[0].entry.original });
  elapse(30_000);
  assert.throws(() => engine.action(room, players[0], 'unlock-claim', { round: 1 }), /over/);
  engine.action(room, players[0], 'vote', { round: 1, targetId: players[1].id, truth: true });
  engine.action(room, players[0], 'finish-votes', { round: 1 });
  elapse(60_000);
  assert.throws(() => engine.action(room, players[0], 'unlock-votes', { round: 1 }), /over/);
});

test('no connected players do not trigger a cascade of early phase transitions', () => {
  const { engine, room, players } = party();
  for (const player of players) engine.setConnected(room, player, false);
  engine.maybeAdvance(room);
  assert.equal(room.phase, 'draw');
});

test('leaving mid-round removes the player, frees readiness, and transfers the host', () => {
  const { engine, room, players } = party(3);
  const departingToken = players[0].token;
  for (const player of players.slice(1)) engine.action(room, player, 'drawing', { round: 1, strokes: sketch, done: true });
  engine.leave(room, players[0]);
  assert.equal(room.hostId, players[1].id);
  assert.equal(room.players.length, 2);
  assert.equal(room.phase, 'claim');
  assert.throws(() => engine.authenticate(room.code, departingToken), /expired/);
  engine.action(room, players[1], 'claim', { round: 1, claim: players[1].entry.original });
  engine.leave(room, players[2]);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.players.length, 1);
  engine.leave(room, players[1]);
  assert.throws(() => engine.getRoom(room.code), /not found/);
});

test('leaving during judging removes that drawing from remaining vote requirements', () => {
  const { engine, room, players } = party(3);
  submitDrawings(engine, room, players);
  for (const player of players) engine.action(room, player, 'claim', { round: 1, claim: player.entry.original });
  engine.leave(room, players[2]);
  for (const player of players.slice(0, 2)) {
    const target = players.slice(0, 2).find((other) => other !== player);
    engine.action(room, player, 'vote', { round: 1, targetId: target.id, truth: true });
    engine.action(room, player, 'finish-votes', { round: 1 });
  }
  assert.equal(room.phase, 'reveal');
  assert.equal(room.history[0].entries.length, 2);
  assert.ok(room.players.every((player) => player.score === 800));
});

test('host transfers after disconnection, and reconnect keeps identity and score', () => {
  const { engine, room, players, elapse } = party();
  engine.setConnected(room, players[0], false);
  elapse(10_001);
  assert.equal(room.hostId, players[1].id);
  const restored = engine.authenticate(room.code, players[0].token);
  assert.equal(restored.player.id, players[0].id);
  engine.setConnected(room, players[0], true);
  assert.equal(engine.view(room, players[0]).round, 1);
});

test('eight players complete five rounds, scores accumulate once, ties win, rematch resets', () => {
  const { engine, room, host, players } = party(8);
  for (let round = 1; round <= 5; round += 1) {
    submitDrawings(engine, room, players);
    assert.ok(players.every((player) => player.entry.lockedSlot === 'action'));
    for (const player of players) engine.action(room, player, 'claim', { round, claim: player.entry.original });
    for (const player of players) {
      for (const target of players.filter((other) => other !== player)) engine.action(room, player, 'vote', { round, targetId: target.id, truth: true });
      engine.action(room, player, 'finish-votes', { round });
    }
    assert.equal(room.phase, 'reveal');
    assert.equal(room.history.length, round);
    assert.throws(() => engine.action(room, players[1], 'next'), /host/);
    engine.action(room, host, 'next');
  }
  assert.equal(room.phase, 'finished');
  assert.equal(room.round, 5);
  assert.equal(room.usedPrompts.length, 40);
  assert.equal(new Set(room.usedPrompts).size, 40);
  assert.ok(players.every((player) => player.score === 28000));
  assert.equal(engine.view(room, host).winners.length, 8);
  const previousGameId = room.gameId;
  engine.action(room, host, 'rematch');
  assert.equal(room.phase, 'lobby');
  assert.ok(players.every((player) => player.score === 0 && player.entry === null));
  engine.start(room, host);
  assert.notEqual(room.gameId, previousGameId);
  submitDrawings(engine, room, players);
  assert.ok(players.every((player) => player.entry.lockedSlot === 'action'));
});

test('prompt shuffle is private, unlimited, and has a one-second cooldown', () => {
  const { engine, room, players, elapse } = party();
  const [player, other] = players;
  const initialDeadline = room.deadline;
  const otherPrompt = structuredClone(other.entry.original);
  engine.action(room, player, 'drawing', { round: 1, strokes: sketch });
  for (let index = 0; index < 12; index++) {
    const original = structuredClone(player.entry.original);
    engine.action(room, player, 'reroll-prompt', { round: 1 });
    assert.notDeepEqual(player.entry.original, original);
    assert.deepEqual(player.entry.claim, player.entry.original);
    assert.deepEqual(player.entry.strokes, sketch);
    assert.deepEqual(other.entry.original, otherPrompt);
    assert.equal(room.deadline, initialDeadline);
    assert.equal(engine.view(room, player).me.rerollReadyAt, player.entry.rerollReadyAt);
    assert.equal(engine.view(room, other).players[0].entry, undefined);
    assert.throws(() => engine.action(room, player, 'reroll-prompt', { round: 1 }), /one second/);
    elapse(999);
    assert.throws(() => engine.action(room, player, 'reroll-prompt', { round: 1 }), /one second/);
    elapse(1);
  }
  engine.action(room, player, 'drawing', { round: 1, strokes: sketch, done: true });
  assert.throws(() => engine.action(room, player, 'reroll-prompt', { round: 1 }), /Unlock/);
  engine.action(room, player, 'unlock-drawing', { round: 1 });
  engine.action(room, player, 'reroll-prompt', { round: 1 });
  elapse(60000);
  assert.throws(() => engine.action(room, player, 'reroll-prompt', { round: 1 }), /Drawing time/);
});
