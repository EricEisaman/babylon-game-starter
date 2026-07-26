#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const srcRoot = path.join(repoRoot, 'src', 'client');

/** @typedef {'WebGL2' | 'WebGPU'} PlaygroundEngine */

/**
 * Parse `--engine=WebGL2|WebGPU` (default WebGL2).
 * @returns {PlaygroundEngine}
 */
function parseEngineArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--engine='));
  if (!raw) {
    return 'WebGL2';
  }
  const value = raw.slice('--engine='.length).trim();
  if (value === 'WebGL2' || value === 'WebGPU') {
    return value;
  }
  console.error(`Invalid --engine=${value}. Use WebGL2 or WebGPU.`);
  process.exit(1);
}

// Every folder under src/client/ whose *.ts files must be bundled into the
// playground snippet. Keep this in sync with the transitive imports of the
// entry file below: if `managers/multiplayer_bootstrap.ts` imports
// `../sync/item_sync`, then `sync` must be listed here or the pasted snippet
// will fail to resolve the import inside https://playground.babylonjs.com.
// `scripts/check-playground-export.mjs` catches missing folders after export.
// `pwa/` is intentionally excluded — service worker code is Vite-only; playground
// uses utils/pwa_runtime.ts stubs wired from main.ts.
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

/**
 * @param {PlaygroundEngine} engine
 * @returns {string[]}
 */
function resolveOutputFiles(engine) {
  const fileName = engine === 'WebGPU' ? 'playground-wgpu.json' : 'playground.json';
  return [
    path.join(srcRoot, 'public', fileName),
    path.join(srcRoot, 'playground', fileName),
  ];
}

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

async function readImportMap() {
  // The Babylon Playground V2 manifest resolves bare specifiers through this import map
  // (specifier -> esm.sh URL). `recast-navigation` must be pinned to our installed version;
  // otherwise the Playground falls back to the older copy bundled by Babylon's navigation
  // plugin, which predates `importNavMesh` and breaks compilation.
  const pkgRaw = await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const recastRange = pkg.dependencies?.['recast-navigation'] ?? '0.43.1';
  const recastVersion = recastRange.replace(/^[^0-9]*/, '');
  return {
    'recast-navigation': `https://esm.sh/recast-navigation@${recastVersion}`,
  };
}

/**
 * @param {PlaygroundEngine} engine
 */
function buildEnvelopeMeta(engine) {
  if (engine === 'WebGPU') {
    return {
      name: 'Babylon Game Starter (WebGPU)',
      description:
        'Generated from local source via npm run export:playground:webgpu (WebGPU engine)',
      tags: 'babylon-game-starter,webgpu',
    };
  }
  return {
    name: 'Babylon Game Starter',
    description: 'Generated from local source via npm run export:playground',
    tags: 'babylon-game-starter',
  };
}

async function generate() {
  const engine = parseEngineArg();
  const outputFiles = resolveOutputFiles(engine);
  const files = await collectSourceFiles();
  const fileMap = await readFileMap(files);
  const imports = await readImportMap();
  const meta = buildEnvelopeMeta(engine);

  const codeManifest = {
    v: 2,
    language: 'TS',
    entry: entryFile,
    imports,
    files: fileMap,
  };

  const codeString = JSON.stringify(codeManifest);
  const payload = {
    code: codeString,
    unicode: Buffer.from(codeString, 'utf8').toString('base64'),
    engine,
    version: 2,
  };

  const output = {
    payload: JSON.stringify(payload),
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
  };

  const serialized = JSON.stringify(output);

  for (const outPath of outputFiles) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, serialized, 'utf8');
  }

  console.log(`Generated playground JSON (${engine}) with ${files.length} TS files.`);
  for (const outPath of outputFiles) {
    console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
  }
}

generate().catch((error) => {
  console.error('Failed to generate playground JSON:', error);
  process.exit(1);
});
