#!/usr/bin/env node
/**
 * Smoke check for `playground.json`.
 *
 * Parses the playground manifest produced by `generate-playground-json.mjs`,
 * walks every relative `import ... from '...'` in every bundled `.ts` file
 * starting from the entry, and fails if any imported path is missing from
 * the manifest's `files` map. Catches the classic "student pastes the
 * snippet, runtime throws 'Cannot find module ../sync/item_sync'" failure
 * without needing a browser.
 *
 * Usage: invoked automatically after `npm run export:playground`. Run
 * manually with `node scripts/check-playground-export.mjs`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const manifestPaths = [
  path.join(repoRoot, 'src', 'client', 'public', 'playground.json'),
  path.join(repoRoot, 'src', 'client', 'playground', 'playground.json')
];

const IMPORT_RE = /(?:import|export)(?:\s+type)?\s+(?:[^'"`;]+?\s+from\s+)?['"]([^'"]+)['"]/g;

// The Babylon playground's snippet loader rewrites `await import('./x')` to a
// bare path token without quotes (e.g. `import(__pg__/x.ts?v=...)`), which V8
// rejects as `SyntaxError: Unexpected token ','`. Static imports are rewritten
// correctly. Reject any dynamic relative `import()` in playground-bundled
// files. Bare specifiers and URL strings are fine.
const DYNAMIC_RELATIVE_IMPORT_RE = /\bimport\s*\(\s*['"`](\.\.?\/[^'"`]+)['"`]\s*\)/g;

// `BABYLON` is meant to be an ambient global in this project (see
// `src/client/global.d.ts`'s `/// <reference types="babylonjs" />` and the
// playground runtime's UMD injection). A module namespace import like
// `import * as BABYLON from '@babylonjs/core'` shadows that global with a
// type surface the playground's Monaco TS service does NOT expose concrete
// classes on (e.g. `BABYLON.Light`, `BABYLON.PointLight`, `BABYLON.Color3`
// all report `no exported member` in the playground, even though they work
// locally). The fix is to drop the namespace import and rely on the ambient
// global — which is the same pattern every non-broken file in the project
// already follows. Reject the namespace import in bundled files.
const NAMESPACE_BABYLON_IMPORT_RE =
  /^\s*import\s+\*\s+as\s+BABYLON\s+from\s+['"]@babylonjs\/core['"]/m;

// PWA modules (service worker, workbox) are Vite-only. Playground uses
// utils/pwa_runtime.ts stubs; nothing in the export graph may import pwa/.
const PWA_IMPORT_PATH_RE = /(?:^|\/)pwa\//;

/**
 * Parse the doubly-wrapped playground JSON into the inner file manifest.
 */
async function loadManifest(p) {
  const raw = await fs.readFile(p, 'utf8');
  const outer = JSON.parse(raw);
  const payload = JSON.parse(outer.payload);
  const code = JSON.parse(payload.code);
  return {
    entry: code.entry,
    files: code.files ?? {},
    manifestPath: p
  };
}

/**
 * Resolve `relImport` as if it appeared inside `fromFile` (POSIX paths).
 * Returns the relative path inside the manifest (e.g. `managers/foo.ts`) or
 * null when the import is not a relative TS module (package imports, URL
 * imports, side-effect globals like BABYLON are ignored).
 */
function resolveRelative(fromFile, relImport) {
  if (!relImport.startsWith('.')) {
    return null;
  }
  const fromDir = path.posix.dirname(fromFile);
  const joined = path.posix.normalize(path.posix.join(fromDir, relImport));
  return joined;
}

/**
 * Given a resolved path without extension, return the manifest key that
 * actually exists, or null. Tries `.ts`, `/index.ts`, and the raw path.
 */
function pickManifestKey(files, resolvedNoExt) {
  if (files[resolvedNoExt]) {
    return resolvedNoExt;
  }
  const withTs = `${resolvedNoExt}.ts`;
  if (files[withTs]) {
    return withTs;
  }
  const asIndex = path.posix.join(resolvedNoExt, 'index.ts');
  if (files[asIndex]) {
    return asIndex;
  }
  return null;
}

function check(manifest) {
  const { entry, files } = manifest;
  if (!files[entry]) {
    return [`entry file "${entry}" is missing from the manifest`];
  }

  const visited = new Set();
  const queue = [entry];
  const errors = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = files[current];
    if (typeof source !== 'string') {
      errors.push(`file "${current}" has no source text in manifest`);
      continue;
    }

    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(source)) !== null) {
      const rel = match[1];
      const resolved = resolveRelative(current, rel);
      if (resolved === null) {
        // Package import or URL import; not our problem.
        continue;
      }
      if (PWA_IMPORT_PATH_RE.test(resolved)) {
        errors.push(
          `${current}: import "${rel}" resolves to "${resolved}" which is PWA-only (Vite build). ` +
            `Playground export must use utils/pwa_runtime.ts instead — see BRANDING.md / PLAYGROUND.md.`
        );
        continue;
      }
      const key = pickManifestKey(files, resolved);
      if (!key) {
        errors.push(
          `${current}: import "${rel}" resolves to "${resolved}" which is not in the manifest. ` +
            `Add its parent folder to exportRoots in scripts/generate-playground-json.mjs.`
        );
        continue;
      }
      if (!visited.has(key)) {
        queue.push(key);
      }
    }

    DYNAMIC_RELATIVE_IMPORT_RE.lastIndex = 0;
    let dyn;
    while ((dyn = DYNAMIC_RELATIVE_IMPORT_RE.exec(source)) !== null) {
      if (PWA_IMPORT_PATH_RE.test(dyn[1])) {
        errors.push(
          `${current}: dynamic import "${dyn[1]}" is PWA-only (Vite build). ` +
            `Use utils/pwa_runtime.ts in playground-bundled code instead.`
        );
        continue;
      }
      errors.push(
        `${current}: dynamic relative import "${dyn[1]}" is forbidden in playground-bundled code. ` +
          `The Babylon playground rewrites the specifier to a bare token without quotes, producing ` +
          `\`SyntaxError: Unexpected token ','\` when the blob is imported. Use a static \`import\` ` +
          `at the top of the file instead. See PLAYGROUND.md ("Static imports only, no dynamic ` +
          `relative \`import()\`").`
      );
    }

    if (NAMESPACE_BABYLON_IMPORT_RE.test(source)) {
      errors.push(
        `${current}: \`import * as BABYLON from '@babylonjs/core'\` is forbidden in ` +
          `playground-bundled code. It shadows the ambient \`BABYLON\` global with a narrower ` +
          `module namespace whose type surface the Babylon playground reports as missing ` +
          `concrete classes (Light, PointLight, Color3, ...). Remove the import and use ` +
          `bare \`BABYLON.*\` references — the ambient global is populated at runtime by ` +
          `Babylon's UMD legacy bundle locally and by the playground loader in the browser. ` +
          `See PLAYGROUND.md ("The ambient \`BABYLON\` global: never \`import * as BABYLON\`").`
      );
    }
  }

  return errors;
}

async function main() {
  let totalErrors = 0;

  for (const manifestPath of manifestPaths) {
    let manifest;
    try {
      manifest = await loadManifest(manifestPath);
    } catch (err) {
      console.error(`Could not read ${path.relative(repoRoot, manifestPath)}: ${err.message}`);
      totalErrors += 1;
      continue;
    }

    const errors = check(manifest);
    const rel = path.relative(repoRoot, manifestPath);
    if (errors.length === 0) {
      const fileCount = Object.keys(manifest.files).length;
      console.log(`${rel}: OK (${fileCount} files reachable from ${manifest.entry}).`);
    } else {
      console.error(`${rel}: ${errors.length} problem(s):`);
      for (const e of errors) {
        console.error(`  - ${e}`);
      }
      totalErrors += errors.length;
    }
  }

  if (totalErrors > 0) {
    console.error(
      `\nplayground export is incomplete (${totalErrors} problem(s)). ` +
        'The pasted snippet will throw module-resolution errors in the Babylon playground.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('playground export check crashed:', err);
  process.exit(1);
});
