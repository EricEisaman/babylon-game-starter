#!/usr/bin/env node
/**
 * Generates PWA icons and install screenshots from branding source art.
 *
 * Reads paths from src/client/public/branding/config.json and writes PNGs
 * under public/branding/icons/ and public/branding/screenshots/.
 *
 * Usage: node scripts/generate-pwa-assets.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import {
  loadBrandingConfigJson,
  resolveBrandingConfig
} from '../src/deployment/branding/load_branding_config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'src', 'client', 'public');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function publicPathFromConfig(configPath) {
  return path.join(publicRoot, configPath.replace(/^\/+/, ''));
}

async function generateIcons(resolved) {
  const sourceLogo = publicPathFromConfig('/branding/images/logo.png');
  const iconsDir = path.join(publicRoot, 'branding', 'icons');
  await ensureDir(iconsDir);

  const icon192 = publicPathFromConfig(resolved.pwa.icons['192']);
  const icon512 = publicPathFromConfig(resolved.pwa.icons['512']);
  const iconMaskable = publicPathFromConfig(resolved.pwa.icons['512Maskable']);

  const logo = sharp(sourceLogo);

  await logo.clone().resize(192, 192, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } }).png().toFile(icon192);
  await logo.clone().resize(512, 512, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } }).png().toFile(icon512);

  // Maskable safe zone: icon content in center ~80% of canvas
  const maskableCanvas = sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 26, g: 26, b: 26, alpha: 1 }
    }
  });

  const innerIcon = await logo.clone().resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  await maskableCanvas
    .composite([{ input: innerIcon, gravity: 'centre' }])
    .png()
    .toFile(iconMaskable);

  console.log('Icons written:', path.relative(repoRoot, icon192));
  console.log('Icons written:', path.relative(repoRoot, icon512));
  console.log('Icons written:', path.relative(repoRoot, iconMaskable));
}

async function generateScreenshots(resolved) {
  const bannerPath = path.join(repoRoot, 'resources', 'Babylon_Game_Starter_Banner.jpg');
  const screenshotsDir = path.join(publicRoot, 'branding', 'screenshots');
  await ensureDir(screenshotsDir);

  const banner = sharp(bannerPath);

  for (const shot of resolved.pwa.screenshots) {
    const [widthStr, heightStr] = shot.sizes.split('x');
    const width = Number(widthStr);
    const height = Number(heightStr);
    const outPath = publicPathFromConfig(shot.src);

    await banner
      .clone()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(outPath);

    console.log('Screenshot written:', path.relative(repoRoot, outPath), `(${shot.formFactor})`);
  }
}

async function main() {
  const raw = loadBrandingConfigJson(repoRoot);
  const resolved = resolveBrandingConfig(raw);

  await generateIcons(resolved);
  await generateScreenshots(resolved);
  console.log('PWA assets generated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
