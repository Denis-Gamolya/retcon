import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { isTruth, slots, validateClaim, vocabulary } from './vocabulary.mjs';

export const timing = { draw: 60_000, claim: 30_000, judge: 60_000 };
export const palette = ['#172033', '#e53935', '#ef9b24', '#f4d438', '#13816a', '#24bfd1', '#3478e5', '#7057ff', '#ee5b75', '#915c38', '#ffffff'];
const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomLifetime = 6 * 60 * 60 * 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nickname(value) {
  assert(typeof value === 'string', 'Enter a nickname.');
  const name = value.trim().replace(/\s+/g, ' ');
  assert(name.length >= 1 && name.length <= 20, 'Nicknames must be 1–20 characters.');
  assert(!/[\u0000-\u001f]/.test(name), 'Use a readable nickname.');
  return name;
}

/** Normalize vector strokes; coordinates use an 800 × 500 drawing surface. */
export function validateDrawing(value) {
  assert(Array.isArray(value) && value.length <= 250, 'The drawing has too many strokes.');
  let pointCount = 0;
  let spanCount = 0;
  return value.map((stroke) => {
    assert(stroke && palette.includes(stroke.color), 'Choose a supported pen color.');
    const opacity = stroke.opacity === undefined ? {} : { opacity: stroke.opacity };
    assert(stroke.opacity === undefined || (Number.isFinite(stroke.opacity) && stroke.opacity >= 0.01 && stroke.opacity <= 1), 'Invalid opacity.');
    if (stroke.type === 'fill') {
      assert(Array.isArray(stroke.spans) && stroke.spans.length > 0, 'Invalid fill.');
      spanCount += stroke.spans.length;
      assert(spanCount <= 12000, 'The drawing has too many filled areas.');
      return {
        type: 'fill', color: stroke.color, ...opacity,
        spans: stroke.spans.map((span) => {
          assert(Array.isArray(span) && span.length === 3 && span.every(Number.isInteger), 'Invalid fill coordinates.');
          assert(span[0] >= 0 && span[0] < 500 && span[1] >= 0 && span[1] < span[2] && span[2] <= 800, 'Fill coordinates are out of bounds.');
          return [...span];
        }),
      };
    }
    assert(stroke.type === undefined, 'Invalid drawing tool.');
    assert(Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 64, 'Choose a supported pen size.');
    assert(Array.isArray(stroke.points) && stroke.points.length >= 1 && stroke.points.length <= 2000, 'Invalid stroke.');
    pointCount += stroke.points.length;
    assert(pointCount <= 12_000, 'The drawing is full. Try undoing a stroke.');
    return {
      color: stroke.color,
      width: stroke.width,
      ...opacity,
      points: stroke.points.map((point) => {
        assert(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite), 'Invalid drawing coordinates.');
        assert(point[0] >= 0 && point[0] <= 800 && point[1] >= 0 && point[1] <= 500, 'Drawing coordinates are out of bounds.');
        return point.map((coordinate) => Math.round(coordinate * 10) / 10);
      }),
    };
  });
}

/** Server-owned room state. Clock injection lets tests exercise actual deadlines. */
export class GameEngine {
  constructor({ now = Date.now, durations = timing, totalRounds = 5 } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.durations = durations;
    this.totalRounds = totalRounds;
  }

  create(name) {
    assert(this.rooms.size < 500, 'The server is full. Try again later.');
    let code;
    do {
      code = Array.from({ length: 6 }, () => roomAlphabet[randomInt(roomAlphabet.length)]).join('');
    } while (this.rooms.has(code));
    const room = {
      code, phase: 'lobby', gameId: null, round: 0, deadline: null, players: [],
      hostId: null, usedPrompts: [], history: [], version: 0, updatedAt: this.now(),
    };
    this.rooms.set(code, room);
    const result = this.join(code, name);
    room.hostId = result.player.id;
    return result;
  }

  getRoom(code) {
    const room = this.rooms.get(String(code).toUpperCase());
    assert(room, 'Room not found. Check the code or create a new room.');
    return room;
  }

  join(code, name) {
    const room = this.getRoom(code);
    assert(room.phase === 'lobby', 'This game has started. Join when the room returns to the lobby.');
    assert(room.players.length < 8, 'This room already has eight players.');
    const cleanName = nickname(name);
    assert(!room.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase()), 'That nickname is already in use in this room.');
    const player = {
      id: randomUUID(), token: randomBytes(32).toString('hex'), name: cleanName,
      score: 0, connected: false, lastSeen: this.now(), entry: null,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    this.touch(room);
    return { room, player };
  }

  authenticate(code, token) {
    const room = this.getRoom(code);
    const player = room.players.find((candidate) => candidate.token === token);
    assert(player, 'Your room session has expired. Join again.');
    return { room, player };
  }

  touch(room) {
    room.version += 1;
    room.updatedAt = this.now();
  }

  setConnected(room, player, connected) {
    player.connected = connected;
    player.lastSeen = this.now();
    this.touch(room);
    if (!connected) this.maybeAdvance(room);
  }

  transferHost(room) {
    const host = room.players.find((player) => player.id === room.hostId);
    if (!host || (!host.connected && this.now() - host.lastSeen > 10_000)) {
      const successor = room.players.find((player) => player.connected);
      if (successor && successor.id !== room.hostId) {
        room.hostId = successor.id;
        this.touch(room);
      }
    }
  }

  start(room, player) {
    assert(room.hostId === player.id, 'Only the host can start the game.');
    assert(room.phase === 'lobby', 'The game has already started.');
    assert(room.players.length >= 2 && room.players.every((member) => member.connected), 'At least two players must be connected. Remove disconnected players before starting.');
    room.players.forEach((member) => { member.score = 0; });
    room.history = [];
    room.usedPrompts = [];
    room.gameId = randomUUID();
    room.round = 0;
    this.beginRound(room);
  }

  beginRound(room) {
    room.round += 1;
    room.phase = 'draw';
    room.deadline = this.now() + this.durations.draw;
    for (const player of room.players) {
      let original;
      let key;
      do {
        original = Object.fromEntries(slots.map((slot) => [slot, vocabulary[slot][randomInt(vocabulary[slot].length)].id]));
        key = JSON.stringify(original);
      } while (room.usedPrompts.includes(key));
      room.usedPrompts.push(key);
      player.entry = {
        original, claim: { ...original }, lockedSlot: null, strokes: [],
        drawingDone: false, claimDone: false, votesDone: false,
        votes: {}, active: false, rerollReadyAt: 0,
      };
    }
    this.touch(room);
  }

  /** Advance deadlines from wall-clock time, including after an inactive tab resumes. */
  tick(room) {
    this.transferHost(room);
    if (room.deadline !== null && this.now() >= room.deadline) this.advance(room);
  }

  advance(room) {
    if (room.phase === 'draw') {
      for (const player of room.players) {
        player.entry.active = player.entry.strokes.length > 0;
        player.entry.lockedSlot = 'action';
      }
      room.phase = 'claim';
      room.deadline = this.now() + this.durations.claim;
    } else if (room.phase === 'claim') {
      room.phase = 'judge';
      room.deadline = this.now() + this.durations.judge;
      if (room.players.every((player) => this.targets(room, player).length === 0)) {
        this.score(room);
        return;
      }
    } else if (room.phase === 'judge') {
      this.score(room);
      return;
    } else {
      return;
    }
    this.touch(room);
    this.maybeAdvance(room);
  }

  targets(room, player) {
    return room.players.filter((other) => other.id !== player.id && other.entry?.active);
  }

  maybeAdvance(room) {
    const participants = room.players.filter((player) => player.connected);
    if (!participants.length) return;
    const complete =
      (room.phase === 'draw' && participants.every((player) => player.entry.drawingDone)) ||
      (room.phase === 'claim' && participants.every((player) => !player.entry.active || player.entry.claimDone)) ||
      (room.phase === 'judge' && participants.every((player) => this.targets(room, player).length === 0 || player.entry.votesDone));
    if (complete) this.advance(room);
  }

  action(room, player, action, payload = {}) {
    this.tick(room);
    if (action === 'start') return this.start(room, player);
    if (action === 'next') {
      assert(room.hostId === player.id, 'Only the host can continue.');
      assert(room.phase === 'reveal', 'Finish this round first.');
      if (room.round < this.totalRounds) this.beginRound(room);
      else {
        room.phase = 'finished';
        this.touch(room);
      }
      return;
    }
    if (action === 'rematch') {
      assert(room.hostId === player.id && room.phase === 'finished', 'Only the host can open a rematch after the game.');
      room.phase = 'lobby';
      room.round = 0;
      room.history = [];
      room.players.forEach((member) => { member.entry = null; member.score = 0; });
      this.touch(room);
      return;
    }
    if (action === 'remove') {
      assert(room.phase === 'lobby' && room.hostId === player.id, 'Only the host can remove players in the lobby.');
      assert(payload.playerId !== player.id, 'Use Leave room to leave.');
      room.players = room.players.filter((member) => member.id !== payload.playerId);
      this.touch(room);
      return;
    }
    assert(!payload.gameId || payload.gameId === room.gameId, 'This submission belongs to a previous game.');
    assert(payload.round === room.round, 'This submission belongs to a previous round.');
    const entry = player.entry;
    if (action === 'reroll-prompt') {
      assert(room.phase === 'draw', 'Drawing time is over.');
      assert(!entry.drawingDone, 'Unlock your drawing first.');
      assert(this.now() >= entry.rerollReadyAt, 'Wait one second before shuffling again.');
      let original;
      let key;
      do {
        original = Object.fromEntries(slots.map((slot) => [slot, vocabulary[slot][randomInt(vocabulary[slot].length)].id]));
        key = JSON.stringify(original);
      } while (room.usedPrompts.includes(key));
      room.usedPrompts.push(key);
      entry.original = original;
      entry.claim = { ...original };
      entry.rerollReadyAt = this.now() + 1000;
    } else if (action === 'unlock-drawing') {
      assert(room.phase === 'draw', 'Drawing time is over.');
      entry.drawingDone = false;
    } else if (action === 'unlock-claim') {
      assert(room.phase === 'claim', 'Prompt editing time is over.');
      assert(entry.active, 'There is no drawing to judge this round.');
      entry.claimDone = false;
    } else if (action === 'unlock-votes') {
      assert(room.phase === 'judge', 'Judging time is over.');
      entry.votesDone = false;
    } else if (action === 'drawing') {
      assert(room.phase === 'draw', 'Drawing time is over.');
      assert(!entry.drawingDone, 'Your drawing is already locked.');
      entry.strokes = validateDrawing(payload.strokes);
      entry.drawingDone = payload.done === true;
    } else if (action === 'claim') {
      assert(room.phase === 'claim', 'Prompt editing time is over.');
      assert(entry.active, 'There is no drawing to judge this round.');
      assert(!entry.claimDone, 'Your claim is already locked.');
      entry.claim = validateClaim(entry.original, payload.claim, entry.lockedSlot);
      entry.claimDone = true;
    } else if (action === 'vote') {
      assert(room.phase === 'judge', 'Judging time is over.');
      assert(!entry.votesDone, 'Your votes are already locked.');
      const targets = this.targets(room, player);
      assert(targets.some((target) => target.id === payload.targetId), 'You can only judge another player’s submitted drawing.');
      assert(typeof payload.truth === 'boolean', 'Choose Truth or Lie.');
      entry.votes[payload.targetId] = payload.truth;
    } else if (action === 'finish-votes') {
      assert(room.phase === 'judge', 'Judging time is over.');
      assert(this.targets(room, player).every((target) => typeof entry.votes[target.id] === 'boolean'), 'Judge every drawing before locking your votes.');
      entry.votesDone = true;
    } else {
      throw new Error('Unknown action.');
    }
    this.touch(room);
    this.maybeAdvance(room);
  }

  score(room) {
    const gains = Object.fromEntries(room.players.map((player) => [player.id, { judging: 0, belief: 0 }]));
    const entries = room.players.filter((player) => player.entry.active).map((author) => {
      const truth = isTruth(author.entry.original, author.entry.claim);
      const votes = room.players.filter((judge) => judge.id !== author.id).map((judge) => {
        const vote = judge.entry.votes[author.id];
        const correct = typeof vote === 'boolean' && vote === truth;
        if (correct) gains[judge.id].judging += 500;
        if (vote === true) gains[author.id].belief += 300;
        return { playerId: judge.id, truth: vote ?? null, correct };
      });
      return {
        playerId: author.id, original: author.entry.original,
        claim: author.entry.claim, strokes: author.entry.strokes, truth, votes,
      };
    });
    for (const player of room.players) player.score += gains[player.id].judging + gains[player.id].belief;
    room.history.push({ round: room.round, entries, gains });
    room.phase = 'reveal';
    room.deadline = null;
    this.touch(room);
  }

  leave(room, player) {
    player.leftGame = true;
    room.players = room.players.filter((member) => member.id !== player.id);
    if (room.hostId === player.id) room.hostId = (room.players.find((member) => member.connected) ?? room.players[0])?.id ?? null;
    this.touch(room);
    if (!room.players.length) this.rooms.delete(room.code);
    else this.maybeAdvance(room);
  }

  /** Public projection hides other prompts, locked slots, drafts, and votes until reveal. */
  view(room, player) {
    const entry = player.entry;
    const showGallery = ['judge', 'reveal', 'finished'].includes(room.phase);
    return {
      code: room.code, gameId: room.gameId, phase: room.phase, round: room.round, totalRounds: this.totalRounds,
      deadline: room.deadline, serverTime: this.now(), version: room.version,
      hostId: room.hostId, meId: player.id,
      players: room.players.map((member) => ({
        id: member.id, name: member.name, score: member.score, connected: member.connected,
        ready: room.phase === 'draw' ? member.entry?.drawingDone ?? false
          : room.phase === 'claim' ? !member.entry?.active || member.entry.claimDone
          : room.phase === 'judge' ? member.entry?.votesDone ?? false : false,
      })),
      me: entry ? {
        original: entry.original, claim: entry.claim,
        rerollReadyAt: entry.rerollReadyAt,
        lockedSlot: room.phase === 'draw' ? null : entry.lockedSlot,
        strokes: entry.strokes, drawingDone: entry.drawingDone,
        claimDone: entry.claimDone, votesDone: entry.votesDone,
        votes: entry.votes, active: entry.active,
      } : null,
      gallery: showGallery ? room.players.filter((author) => author.entry?.active).map((author) => ({
        playerId: author.id, claim: author.entry.claim, strokes: author.entry.strokes,
      })) : [],
      result: ['reveal', 'finished'].includes(room.phase) ? room.history.at(-1) ?? null : null,
      history: room.phase === 'finished' ? room.history : [],
      winners: room.phase === 'finished' ? room.players.filter((member) => member.score === Math.max(...room.players.map((candidate) => candidate.score))).map((member) => member.id) : [],
    };
  }

  cleanExpiredRooms() {
    for (const [code, room] of this.rooms) {
      if (!room.players.some((player) => player.connected) && this.now() - room.updatedAt > roomLifetime) this.rooms.delete(code);
    }
  }
}
