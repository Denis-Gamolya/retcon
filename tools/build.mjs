import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipFunctions } from '@netlify/zip-it-and-ship-it';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'web'), resolve(root, 'dist'), { recursive: true });
// Only the browser assets are published; source, tests, and functions stay private.
const client = await readFile(resolve(root, 'dist/client.mjs'), 'utf8');
if (client.includes('/api/') || !client.includes('/.netlify/functions/game')) {
  throw new Error('The frontend must use the direct Netlify function endpoint.');
}
const functions = await readdir(resolve(root, 'netlify/functions'));
if (functions.length !== 1 || functions[0] !== 'game.ts') throw new Error('Only game.ts belongs in netlify/functions.');
// Prebundle dependencies so packaged functions contain no machine-specific
// package-manager symlinks, including when this build runs on Windows.
const functionSource = resolve(root, '.netlify/function-source');
await mkdir(functionSource, { recursive: true });
await build({
  entryPoints: [resolve(root, 'netlify/functions/game.ts')],
  outfile: resolve(functionSource, 'game.mjs'), bundle: true,
  platform: 'node', target: 'node22', format: 'esm',
});
const result = await zipFunctions(functionSource, resolve(root, '.netlify/functions'), {
  basePath: root,
  config: { '*': { nodeBundler: 'esbuild', nodeVersion: '22' } },
  manifest: resolve(root, '.netlify/functions/manifest.json'),
});
if (result.length !== 1 || result[0].name !== 'game') throw new Error('The game function was not packaged.');
await writeFile(resolve(root, '.netlify/build-report.json'), JSON.stringify({
  frontend: 'dist', endpoint: '/.netlify/functions/game',
  functions: result.map(({ name, runtime, runtimeAPIVersion }) => ({ name, runtime, runtimeAPIVersion })),
}, null, 2));
console.log('Built browser assets and packaged the game function.');
