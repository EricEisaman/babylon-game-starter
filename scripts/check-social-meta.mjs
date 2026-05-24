#!/usr/bin/env node
/**
 * Validates Open Graph / Twitter Card metadata in built HTML and via Playwright.
 *
 * Usage: npm run social:test  (runs build first, then this script)
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  buildSocialMetaTags,
  loadBrandingConfigJson,
  resolveBrandingConfig,
  toManifestPath
} from '../src/deployment/branding/load_branding_config.mjs';
import deploymentSettings from '../src/deployment/settings/settings.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');
const PREVIEW_HOST = '127.0.0.1';

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

function getMetaContent(html, selectorPattern) {
  const match = html.match(selectorPattern);
  return match?.[1] ?? null;
}

function validateStaticHtml(html, expected) {
  assert(
    html.includes(`<title>${expected.title}</title>`),
    `dist/index.html missing expected <title>${expected.title}</title>`
  );

  const checks = [
    ['description', expected.description],
    ['og:title', expected.title],
    ['og:description', expected.description],
    ['og:site_name', expected.siteName],
    ['og:type', expected.ogType],
    ['twitter:card', expected.twitterCard],
    ['twitter:title', expected.twitterTitle],
    ['twitter:description', expected.twitterDescription]
  ];

  for (const [property, value] of checks) {
    const isOg = property.startsWith('og:');
    const pattern = isOg
      ? new RegExp(`<meta property="${property}" content="([^"]*)">`)
      : new RegExp(`<meta name="${property}" content="([^"]*)">`);
    const content = getMetaContent(html, pattern);
    assert(content === value, `dist/index.html meta ${property} expected "${value}", got "${content}"`);
  }

  if (expected.ogUrl) {
    const ogUrl = getMetaContent(html, /<meta property="og:url" content="([^"]*)">/);
    assert(ogUrl === expected.ogUrl, `dist/index.html og:url expected "${expected.ogUrl}", got "${ogUrl}"`);
  }

  if (expected.ogImage) {
    const ogImage = getMetaContent(html, /<meta property="og:image" content="([^"]*)">/);
    assert(
      ogImage === expected.ogImage,
      `dist/index.html og:image expected "${expected.ogImage}", got "${ogImage}"`
    );

    const ogImageWidth = getMetaContent(html, /<meta property="og:image:width" content="([^"]*)">/);
    assert(
      ogImageWidth === String(expected.ogImageWidth),
      `dist/index.html og:image:width expected "${expected.ogImageWidth}", got "${ogImageWidth}"`
    );

    const ogImageHeight = getMetaContent(html, /<meta property="og:image:height" content="([^"]*)">/);
    assert(
      ogImageHeight === String(expected.ogImageHeight),
      `dist/index.html og:image:height expected "${expected.ogImageHeight}", got "${ogImageHeight}"`
    );
  }

  console.log('Static dist/index.html social meta: OK');
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

async function readMeta(page, selector) {
  return page.locator(selector).getAttribute('content');
}

async function validateWithPlaywright(previewUrl, expected, imagePathWithBase) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });

    assert(
      (await page.title()) === expected.title,
      `Playwright document.title expected "${expected.title}", got "${await page.title()}"`
    );

    assert(
      (await readMeta(page, 'meta[name="description"]')) === expected.description,
      'Playwright meta description mismatch'
    );
    assert(
      (await readMeta(page, 'meta[property="og:title"]')) === expected.title,
      'Playwright og:title mismatch'
    );
    assert(
      (await readMeta(page, 'meta[property="og:image"]')) === expected.ogImage,
      'Playwright og:image mismatch'
    );
    assert(
      (await readMeta(page, 'meta[name="twitter:card"]')) === expected.twitterCard,
      'Playwright twitter:card mismatch'
    );

    console.log('Playwright head meta tags: OK');

    const previewOrigin = new URL(previewUrl).origin;
    const imageUrl = `${previewOrigin}${imagePathWithBase}`;
    const imageRes = await fetch(imageUrl);
    assert(imageRes.ok, `OG image not served at preview URL: ${imageUrl} (${imageRes.status})`);
    console.log('Preview OG image HTTP: OK');
  } finally {
    await browser.close();
  }
}

async function main() {
  const base = getBasePath();
  const basePath = base.endsWith('/') ? base : `${base}/`;
  const publicUrl = deploymentSettings.static?.publicUrl;

  const resolved = resolveBrandingConfig(loadBrandingConfigJson(repoRoot));
  const expected = buildSocialMetaTags(resolved, { base: basePath, publicUrl });

  const indexPath = path.join(distDir, 'index.html');
  assert(await fs.access(indexPath).then(() => true).catch(() => false), 'dist/index.html missing — run npm run build first');

  const html = await fs.readFile(indexPath, 'utf8');
  validateStaticHtml(html, expected);

  const ogImageRel = toManifestPath(resolved.social.image, basePath);
  const ogImageDist = path.join(distDir, ogImageRel.replace(basePath, '').replace(/^\/+/, ''));
  assert(
    await fs.access(ogImageDist).then(() => true).catch(() => false),
    `OG image missing in dist: ${path.relative(repoRoot, ogImageDist)}`
  );
  console.log('dist OG image file: OK');

  const previewPort = await getFreePort();
  const previewUrl = `http://${PREVIEW_HOST}:${previewPort}${basePath}`;
  console.log(`Starting preview at ${previewUrl} ...`);

  const previewProc = await spawnPreview(previewPort);
  try {
    await waitForHttp(previewUrl);
    console.log('Preview server ready.');
    await validateWithPlaywright(previewUrl, expected, ogImageRel);
    console.log('Social meta validation passed.');
  } finally {
    previewProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
