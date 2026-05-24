#!/usr/bin/env node
/**
 * Validates PWA installability: branding config, dist artifacts, and Lighthouse PWA audits.
 *
 * Usage: npm run pwa:test  (runs build first, then this script)
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

import {
  loadBrandingConfigJson,
  resolveBrandingConfig
} from '../src/deployment/branding/load_branding_config.mjs';
import deploymentSettings from '../src/deployment/settings/settings.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');
const clientPublic = path.join(repoRoot, 'src', 'client', 'public');

const PREVIEW_HOST = '127.0.0.1';

const REQUIRED_INSTALL_AUDITS = [
  'installable-manifest',
  'service-worker',
  'maskable-icon'
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getBasePath() {
  const isGithub =
    deploymentSettings.host === 'github.io' && deploymentSettings.type === 'static';
  return isGithub ? (deploymentSettings.static?.basePath ?? '/') : '/';
}

async function fileExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function validateSourceBrandingConfig() {
  const raw = loadBrandingConfigJson(repoRoot);
  const resolved = resolveBrandingConfig(raw);
  const errors = [];

  if (!resolved.pwa.enabled) {
    errors.push('branding config: pwa.enabled must be true for installable builds');
  }
  if (!resolved.pwa.name) {
    errors.push('branding config: pwa.name is required');
  }
  if (!resolved.pwa.shortName) {
    errors.push('branding config: pwa.shortName is required');
  }
  if (!resolved.pwa.icons?.['192'] || !resolved.pwa.icons?.['512']) {
    errors.push('branding config: pwa.icons must include 192 and 512 paths');
  }
  if (!resolved.pwa.icons?.['512Maskable']) {
    errors.push('branding config: pwa.icons.512Maskable is required for maskable-icon audit');
  }

  const screenshots = resolved.pwa.screenshots ?? [];
  const hasWide = screenshots.some((s) => s.formFactor === 'wide');
  const hasNarrow = screenshots.some((s) => s.formFactor === 'narrow');
  if (!hasWide || !hasNarrow) {
    errors.push('branding config: pwa.screenshots must include wide and narrow form factors');
  }

  if (errors.length > 0) {
    throw new Error(`Source branding/PWA validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  console.log('Source branding config: OK');
  return resolved;
}

async function validateSourceFiles(resolved) {
  const errors = [];
  for (const iconPath of Object.values(resolved.pwa.icons)) {
    const abs = path.join(clientPublic, iconPath.replace(/^\/+/, ''));
    if (!(await fileExists(abs))) {
      errors.push(`missing icon file: ${path.relative(repoRoot, abs)}`);
    }
  }
  for (const shot of resolved.pwa.screenshots) {
    const abs = path.join(clientPublic, shot.src.replace(/^\/+/, ''));
    if (!(await fileExists(abs))) {
      errors.push(`missing screenshot file: ${path.relative(repoRoot, abs)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`PWA asset files missing:\n  - ${errors.join('\n  - ')}`);
  }
  console.log('PWA asset files on disk: OK');
}

async function validateDistArtifacts(base, resolved) {
  assert(await fileExists(distDir), `dist/ not found at ${distDir}. Run npm run build first.`);

  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  assert(await fileExists(manifestPath), 'dist/manifest.webmanifest is missing');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const required = ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color'];
  for (const key of required) {
    assert(manifest[key] != null && manifest[key] !== '', `manifest missing "${key}"`);
  }

  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest.icons must have at least 2 entries');
  const sizes = manifest.icons.map((i) => i.sizes);
  assert(sizes.some((s) => s.includes('192')), 'manifest must include a 192x192 icon');
  assert(sizes.some((s) => s.includes('512')), 'manifest must include a 512x512 icon');
  assert(
    manifest.icons.some((i) => i.purpose === 'maskable' || (Array.isArray(i.purpose) && i.purpose.includes('maskable'))),
    'manifest must include a maskable icon'
  );

  assert(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2, 'manifest.screenshots required');
  const formFactors = manifest.screenshots.map((s) => s.form_factor);
  assert(formFactors.includes('wide'), 'manifest screenshots must include form_factor wide');
  assert(formFactors.includes('narrow'), 'manifest screenshots must include form_factor narrow');

  for (const icon of manifest.icons) {
    const rel = icon.src.replace(base, '').replace(/^\//, '');
    const abs = path.join(distDir, rel);
    assert(await fileExists(abs), `manifest icon not in dist: ${icon.src}`);
  }

  for (const shot of manifest.screenshots) {
    const rel = shot.src.replace(base, '').replace(/^\//, '');
    const abs = path.join(distDir, rel);
    assert(await fileExists(abs), `manifest screenshot not in dist: ${shot.src}`);
  }

  const swPath = path.join(distDir, 'sw.js');
  assert(await fileExists(swPath), 'dist/sw.js service worker is missing');

  console.log('dist/ PWA artifacts: OK');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, PREVIEW_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (res.ok || res.status === 304) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

function spawnPreview(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
        'preview',
        '--host',
        PREVIEW_HOST,
        '--port',
        String(port),
        '--strictPort'
      ],
      {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' }
      }
    );

    let settled = false;
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes('http://')) {
        if (!settled) {
          settled = true;
          resolve(child);
        }
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled) {
        reject(new Error(`vite preview exited with code ${code ?? 'unknown'}`));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(child);
      }
    }, 8000);
  });
}

async function validatePreviewInstallability(previewUrl, basePath) {
  const manifestUrl = new URL('manifest.webmanifest', previewUrl).href;
  const swUrl = new URL('sw.js', previewUrl).href;
  const indexUrl = previewUrl;

  const manifestRes = await fetch(manifestUrl);
  assert(manifestRes.ok, `preview manifest fetch failed: ${manifestRes.status} ${manifestUrl}`);
  const manifest = await manifestRes.json();
  assert(manifest.display === 'standalone', 'preview manifest display must be standalone');
  assert(
    manifest.icons?.some(
      (icon) =>
        icon.purpose === 'maskable' ||
        (Array.isArray(icon.purpose) && icon.purpose.includes('maskable'))
    ),
    'preview manifest must include a maskable icon'
  );

  const swRes = await fetch(swUrl);
  assert(swRes.ok, `preview service worker fetch failed: ${swRes.status} ${swUrl}`);
  const swText = await swRes.text();
  assert(swText.includes('precache'), 'preview sw.js does not look like a Workbox service worker');

  const indexRes = await fetch(indexUrl);
  assert(indexRes.ok, `preview index fetch failed: ${indexRes.status}`);
  const indexHtml = await indexRes.text();
  assert(
    indexHtml.includes('manifest.webmanifest') || indexHtml.includes('rel="manifest"'),
    'index.html must reference the web app manifest'
  );
  assert(
    indexHtml.includes('branding_config?.ts') ||
      indexHtml.includes('branding_config') ||
      indexHtml.includes('apple-mobile-web-app-capable'),
    'index.html must load branding_config (iOS PWA meta tags applied at runtime)'
  );

  console.log('Preview installability (HTTP): OK');
}

async function runLighthouseInstallabilityIfAvailable(url) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu']
  });

  try {
    const probe = await lighthouse(url, {
      logLevel: 'error',
      output: 'json',
      onlyAudits: REQUIRED_INSTALL_AUDITS,
      port: chrome.port
    });

    const probeAudits = probe?.lhr?.audits ?? {};
    const hasLegacyPwaAudits = REQUIRED_INSTALL_AUDITS.some((id) => probeAudits[id] != null);

    if (!hasLegacyPwaAudits) {
      console.log(
        'Lighthouse 13+ no longer ships PWA installability audits; using static + preview HTTP checks instead.'
      );
      return;
    }

    const result = await lighthouse(url, {
      logLevel: 'error',
      output: 'json',
      onlyAudits: REQUIRED_INSTALL_AUDITS,
      port: chrome.port
    });

    const lhr = result?.lhr;
    assert(lhr, 'Lighthouse returned no result');

    const failures = [];
    for (const auditId of REQUIRED_INSTALL_AUDITS) {
      const audit = lhr.audits[auditId];
      if (!audit) {
        failures.push(`${auditId}: audit not found in Lighthouse report`);
        continue;
      }
      if (audit.score !== 1) {
        failures.push(`${auditId}: ${audit.title} — ${audit.displayValue ?? audit.description}`);
      } else {
        console.log(`Lighthouse audit: ${auditId} — pass`);
      }
    }

    const category = lhr.categories?.pwa;
    if (category?.score != null) {
      console.log(`Lighthouse PWA category score: ${Math.round(category.score * 100)}`);
    }

    if (failures.length > 0) {
      throw new Error(`Lighthouse installability failures:\n  - ${failures.join('\n  - ')}`);
    }
  } finally {
    await chrome.kill();
  }
}

async function main() {
  const base = getBasePath();
  const resolved = validateSourceBrandingConfig();
  await validateSourceFiles(resolved);

  const basePath = base.endsWith('/') ? base : `${base}/`;

  await validateDistArtifacts(basePath, resolved);

  const previewPort = await getFreePort();
  const previewUrl = `http://${PREVIEW_HOST}:${previewPort}${basePath}`;
  console.log(`Starting preview at ${previewUrl} ...`);

  const previewProc = await spawnPreview(previewPort);
  try {
    await waitForHttp(previewUrl);
    console.log('Preview server ready.');
    await validatePreviewInstallability(previewUrl, basePath);
    await runLighthouseInstallabilityIfAvailable(previewUrl);
    console.log('PWA validation passed.');
  } finally {
    previewProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
