/** Local preview only. Netlify deploys netlify/functions/game.ts instead. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPreviewServer } from './tools/preview-server.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const preview = await createPreviewServer();
  preview.server.listen(3000, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:3000'));
}
