import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { createGameHandler } from '../game/netlify-handler.mjs';
import { emulatorFetch } from './blob-emulator.mjs';

/** Serve a local preview with the official Blobs emulator; never deployed. */
export async function createPreviewServer({ directory = '.netlify/blobs', ...options } = {}) {
  await mkdir(directory, { recursive: true });
  const blobs = new BlobsServer({ directory });
  const address = await blobs.start();
  const apiURL = `http://127.0.0.1:${address.port}`;
  const store = getStore({ name: 'sketchy-alibis-rooms', consistency: 'strong', siteID: 'local-preview', token: 'local-preview', apiURL, fetch: emulatorFetch(apiURL) });
  const handle = createGameHandler({ store, ...options });
  const web = resolve(import.meta.dirname, '../web');
  const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  let requests = Promise.resolve();
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      if (url.pathname === '/.netlify/functions/game') {
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > 450000) { outgoing.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
        const request = new Request(url, {
          method: incoming.method, headers: incoming.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        // The file-backed SDK emulator does not serialize conditional writes.
        const pending = requests.catch(() => {}).then(() => handle(request));
        requests = pending;
        const response = await pending;
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname === '/lettering' ? '/lettering.html' : url.pathname;
      const file = resolve(web, `.${decodeURIComponent(pathname)}`);
      if (!file.startsWith(web + sep)) { outgoing.writeHead(403).end(); return; }
      const data = await readFile(file);
      outgoing.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      outgoing.end(data);
    } catch {
      outgoing.writeHead(404).end('Not found');
    }
  });
  return { server, store, close: async () => { await new Promise((done) => server.close(done)); await blobs.stop(); } };
}
