import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewServer } from '../tools/preview-server.mjs';
import { completeGame } from './helpers/game-session.mjs';

test('HTTP endpoint and official Blobs emulator complete three rounds and declare the winner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sketchy-http-'));
  const preview = await createPreviewServer({ directory, totalRounds: 3 });
  preview.server.listen(0, '127.0.0.1');
  await once(preview.server, 'listening');
  const base = `http://127.0.0.1:${preview.server.address().port}`;
  try {
    for (const asset of ['/', '/client.mjs', '/styles.css', '/fonts/sketchy-hand-color.woff2']) {
      assert.equal((await fetch(base + asset)).status, 200);
    }
    assert.equal((await fetch(base + '/api/events')).status, 404);
    await completeGame((request) => fetch(base + '/.netlify/functions/game', {
      method: request.method, headers: request.headers, body: request.body, duplex: 'half',
    }), 3);
  } finally {
    await preview.close();
    await rm(directory, { recursive: true, force: true });
  }
});
