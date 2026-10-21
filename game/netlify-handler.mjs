import { createHash } from 'node:crypto';
import { GameEngine, timing } from './engine.mjs';
import { vocabulary } from './vocabulary.mjs';

const lifetime = 6 * 60 * 60 * 1000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const operations = new Set(['join', 'state', 'action', 'leave']);

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** Bring overdue phases forward from stored deadlines, even across cold starts. */
function advanceDeadlines(engine, room, now) {
  for (let transitions = 0; room.deadline !== null && now >= room.deadline && transitions < 3; transitions++) {
    const deadline = room.deadline;
    const phase = room.phase;
    engine.advance(room);
    const next = phase === 'draw' ? 'claim' : phase === 'claim' ? 'judge' : null;
    if (room.phase === next) room.deadline = deadline + engine.durations[next];
  }
}

/**
 * Build a stateless game endpoint over a strongly consistent Blobs store.
 * Each room, its scores, and its retry receipts commit as one conditional write.
 * No state survives in the function process. Conflicts retry from a fresh read.
 */
export function createGameHandler({ store, now = Date.now, totalRounds = 5, durations = timing }) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.searchParams.get('op') === 'vocabulary') return json(vocabulary);
      if (request.method === 'GET' && url.searchParams.get('op') === 'health') return json({ ok: true });
      if (request.method !== 'POST') return json({ error: 'Use POST for game requests.' }, 405);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw failure('Use the game page to submit your action.', 403);
      if (!request.headers.get('content-type')?.includes('application/json')) throw failure('Send a JSON game request.');
      const text = await request.text();
      if (Buffer.byteLength(text) > 450_000) throw failure('This drawing is too large. Undo some strokes and try again.', 413);
      let payload;
      try { payload = JSON.parse(text); } catch { throw failure('Invalid request.'); }
      if (!payload || typeof payload !== 'object') throw failure('Invalid request.');
      const { op, requestId } = payload;
      if (op !== 'create' && !operations.has(op)) throw failure('Unknown game request.');
      if (!/^[a-f0-9-]{36}$/i.test(requestId ?? '')) throw failure('Missing request identifier.');
      const code = op === 'create'
        ? [...createHash('sha256').update(requestId).digest().subarray(0, 6)].map((byte) => alphabet[byte % alphabet.length]).join('')
        : String(payload.room ?? '').toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) throw failure('Enter a six-character room code.');
      const key = `rooms/${code}`;
      for (let attempt = 0; attempt < 16; attempt++) {
        const timestamp = now();
        const saved = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
        if (saved && !saved.etag) throw failure('Could not safely update the room. Please try again.', 503);
        const engine = new GameEngine({ now: () => timestamp, totalRounds, durations });
        let record = saved?.data;
        let result;
        let error;
        if (op === 'create') {
          if (record) {
            if (record.createId === requestId) return json(record.creator);
            throw failure('Room code collision. Please create a room again.', 409);
          }
          const created = engine.create(payload.name);
          created.room.code = code;
          engine.setConnected(created.room, created.player, true);
          result = { code, token: created.player.token, playerId: created.player.id };
          record = { room: created.room, receipts: [], creator: result, createId: requestId, expiresAt: timestamp + lifetime };
        } else {
          if (!record || record.expiresAt < timestamp || !record.room.players.length) throw failure('Room not found. Check the code or create a new room.', 404);
          // SDK reads return fresh JSON, but cloning also isolates injected test stores.
          record = structuredClone(record);
          const room = record.room;
          engine.rooms.set(code, room);
          let player;
          if (op !== 'join') {
            const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
            player = room.players.find((member) => member.token === token);
            if (!player) throw failure('Your room session has expired. Join again.', 401);
          }
          const receiptKey = `${player?.id ?? 'join'}:${op}:${requestId}`;
          const previous = record.receipts.find((receipt) => receipt.id === receiptKey);
          if (op === 'join' && previous) return json(previous.result);
          const before = JSON.stringify(record);
          if (player) {
            if (!player.connected) engine.setConnected(room, player, true);
            // Polls double as heartbeats; avoid rewriting a room for every read.
            if (timestamp - player.lastSeen >= 5000) player.lastSeen = timestamp;
          }
          for (const member of room.players) {
            if (member !== player && member.connected && timestamp - member.lastSeen > 20000) {
              member.connected = false;
              engine.touch(room);
            }
          }
          advanceDeadlines(engine, room, timestamp);
          engine.transferHost(room);
          engine.maybeAdvance(room);
          try {
            if (op === 'join') {
              player = engine.join(code, payload.name).player;
              engine.setConnected(room, player, true);
              result = { code, token: player.token, playerId: player.id };
            } else if (!previous && op === 'action') {
              if (payload.action === 'next' && payload.round !== room.round) throw failure('This submission belongs to a previous round.');
              engine.action(room, player, payload.action, payload);
            } else if (!previous && op === 'leave') {
              engine.leave(room, player);
            }
          } catch (caught) {
            error = caught;
          }
          if (!error && op !== 'state' && !previous) {
            record.receipts.push({ id: receiptKey, ...(op === 'join' ? { result } : {}) });
            record.receipts = record.receipts.slice(-256);
          }
          if (!error && op !== 'join') {
            result = op === 'leave' ? { ok: true }
              : op === 'state' && payload.since === room.version
                ? { unchanged: true, version: room.version, serverTime: timestamp }
                : engine.view(room, player);
          }
          if (before === JSON.stringify(record)) {
            if (error) throw error;
            return json(result);
          }
          record.expiresAt = timestamp + lifetime;
        }
        const write = await store.setJSON(key, record, saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
        if (write.modified) {
          if (error) throw error;
          return json(result);
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(120, 5 * (attempt + 1)) + Math.random() * 20));
      }
      return json({ error: 'The room is busy. Please try again.' }, 503);
    } catch (error) {
      return json({ error: error.message || 'Could not save. Try again.' }, error.status ?? 400);
    }
  };
}
