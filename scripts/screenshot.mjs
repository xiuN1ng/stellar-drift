/**
 * Screenshot script v3 — debug version.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = '/workspace/screenshots';
const URL = 'http://127.0.0.1:4173/';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('BJS') || t.includes('booted') || t.includes('[perf]') || t.includes('Failed') || t.includes('error')) {
      console.log('[browser]', t);
    }
  });
  page.on('pageerror', (err) => {
    console.error('[page error]', err.message);
  });

  // Direct navigation to in-game URL (skip startup menu via ?autoStart).
  console.log('[screenshot] opening', URL + '?autoStart=wanderer');
  await page.goto(URL + '?autoStart=wanderer', { waitUntil: 'commit', timeout: 15000 });

  // Capture debug after 8s.
  await sleep(8000);
  await page.screenshot({ path: path.join(OUT_DIR, 'debug-1.png') });
  console.log('[screenshot] debug-1 captured at 8s');

  // Wait for HUD.
  const hasHud = await page.evaluate(() => !!document.querySelector('#hud'));
  console.log('[screenshot] HUD present?', hasHud);

  if (hasHud) {
    await sleep(3000);
    await page.screenshot({ path: path.join(OUT_DIR, '02-orbit-galaxy.png') });
    console.log('[screenshot] 02 orbit galaxy captured');
  } else {
    await page.screenshot({ path: path.join(OUT_DIR, '02-no-hud.png') });
    console.error('[screenshot] HUD not found, see debug-1.png and 02-no-hud.png');
  }

  await browser.close();
  console.log('[screenshot] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});