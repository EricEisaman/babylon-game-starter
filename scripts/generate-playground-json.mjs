#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const srcRoot = path.join(repoRoot, 'src', 'client');

// Every folder under src/client/ whose *.ts files must be bundled into the
// playground snippet. Keep this in sync with the transitive imports of the
// entry file below: if `managers/multiplayer_bootstrap.ts` imports
// `../sync/item_sync`, then `sync` must be listed here or the pasted snippet
// will fail to resolve the import inside https://playground.babylonjs.com.
// `scripts/check-playground-export.mjs` catches missing folders after export.
const exportRoots = [
  'config',
  'controllers',
  'datastar',
  'input',
  'managers',
  'simulation',
  'sync',
  'types',
  'ui',
  'utils',
];

const entryFile = 'index.ts';

const outputFiles = [
  path.join(srcRoot, 'public', 'playground.json'),
  path.join(srcRoot, 'playground', 'playground.json'),
];

async function walkTsFiles(absDir, relPrefix) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const rel = path.posix.join(relPrefix, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkTsFiles(abs, rel)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(rel);
    }
  }

  return files;
}

async function collectSourceFiles() {
  const files = [];

  for (const root of exportRoots) {
    const absRoot = path.join(srcRoot, root);
    try {
      const stat = await fs.stat(absRoot);
      if (stat.isDirectory()) {
        files.push(...(await walkTsFiles(absRoot, root)));
      }
    } catch {
      // Optional folder; ignore if missing.
    }
  }

  const absEntry = path.join(srcRoot, entryFile);
  await fs.access(absEntry);
  files.push(entryFile);

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function readFileMap(files) {
  const map = {};
  for (const relPath of files) {
    const absPath = path.join(srcRoot, relPath);
    map[relPath] = await fs.readFile(absPath, 'utf8');
  }
  return map;
}

async function generate() {
  const files = await collectSourceFiles();
  const fileMap = await readFileMap(files);

  const codeManifest = {
    v: 2,
    language: 'TS',
    entry: entryFile,
    imports: {},
    files: fileMap,
  };

  const codeString = JSON.stringify(codeManifest);
  const payload = {
    code: codeString,
    unicode: Buffer.from(codeString, 'utf8').toString('base64'),
    engine: 'WebGL2',
    version: 2,
  };

  const output = {
    payload: JSON.stringify(payload),
    name: 'Babylon Game Starter',
    description: 'Generated from local source via npm run export:playground',
    tags: 'babylon-game-starter',
  };

  const serialized = JSON.stringify(output);

  for (const outPath of outputFiles) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, serialized, 'utf8');
  }

  console.log(`Generated playground JSON with ${files.length} TS files.`);
  for (const outPath of outputFiles) {
    console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
  }
}

generate().catch((error) => {
  console.error('Failed to generate playground JSON:', error);
  process.exit(1);
});
