import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import { emulatorFetch } from '../tools/blob-emulator.mjs';
import { completeGame } from './helpers/game-session.mjs';

test('production function ZIP runs a complete default five-round game with the real Blobs SDK', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sketchy-package-'));
  const files = unzipSync(await readFile(new URL('../.netlify/functions/game.zip', import.meta.url)));
  const manifest = JSON.parse(await readFile(new URL('../.netlify/functions/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.functions.length, 1);
  assert.equal(manifest.functions[0].buildData.runtimeAPIVersion, 2);
  assert.ok(files['___netlify-entry-point.mjs']);
  const entry = Object.keys(files).find((name) => name === 'game.mjs' || name.endsWith('/game.mjs'));
  assert.ok(entry);
  assert.ok(!Object.keys(files).some((name) => name.startsWith('node_modules/')));
  for (const [name, bytes] of Object.entries(files)) {
    const target = resolve(directory, name);
    assert.ok(target.startsWith(directory + sep));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const source = strFromU8(files[entry]);
  assert.ok(!source.includes('config.path'));
  const blobs = new BlobsServer({ directory: join(directory, 'blobs') });
  const address = await blobs.start();
  const apiURL = `http://127.0.0.1:${address.port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emulatorFetch(apiURL, originalFetch);
  // This emulates context injected automatically by Netlify, not user secrets.
  setEnvironmentContext({ apiURL, siteID: 'packaged-test', token: 'local-test' });
  try {
    const { default: handle } = await import(pathToFileURL(resolve(directory, entry)));
    await completeGame(handle, 5);
    assert.equal((await handle(new Request('http://localhost/.netlify/functions/game?op=vocabulary'))).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    setEnvironmentContext({});
    await blobs.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
