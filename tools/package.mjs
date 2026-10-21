import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const content = {};
const folders = ['web', 'dist', 'game', 'netlify', 'tools', 'tests', 'assets'];
const files = ['netlify.toml', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', '.gitignore', 'README.md', 'LETTERING.md', 'VERIFICATION.md', 'server.mjs'];
async function include(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '__pycache__', '.git', '.venv', '.netlify'].includes(item.name) || /\.(log|pyc)$/.test(item.name)) continue;
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await include(path);
    else if (item.isFile()) content[relative(root, path).split('\\').join('/')] = await readFile(path);
  }
}
for (const folder of folders) await include(resolve(root, folder));
for (const file of files) content[file] = await readFile(resolve(root, file));
content['verification/game.zip'] = await readFile(resolve(root, '.netlify/functions/game.zip'));
content['verification/build-report.json'] = await readFile(resolve(root, '.netlify/build-report.json'));
const hashes = Object.fromEntries(Object.entries(content).map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
content['verification/SHA256.json'] = strToU8(JSON.stringify(hashes, null, 2));
const archive = zipSync(content, { level: 6 });
const check = unzipSync(archive);
for (const name of ['netlify.toml', 'package.json', 'pnpm-lock.yaml', 'web/client.mjs', 'dist/index.html', 'netlify/functions/game.ts', 'verification/game.zip']) {
  if (!check[name]) throw new Error(`Missing packaged file: ${name}`);
}
for (const name of Object.keys(check)) {
  if (/(^|\/)(node_modules|__pycache__|\.venv|\.netlify|\.git)(\/|$)|\.log$/.test(name)) throw new Error(`Forbidden archive entry: ${name}`);
}
await writeFile(resolve(root, 'netlify-ready-game.zip'), archive);
console.log(`Packaged ${Object.keys(check).length} files (${archive.length} bytes): netlify-ready-game.zip`);
