#!/usr/bin/env node
/*
 * 花の枠のチラシ（表・裏、カラー・白黒）を作る（2026-11-04 オーナー）。
 *   node scripts/build-flyer-frame.mjs
 * 版下: docs/print/flyer/flyer-frame.html（?mode=bw で白黒）
 * 出力: docs/homepage/assets/flyer-a4-logo.pdf（カラー・これを刷る）／flyer-a4-logo-bw.pdf（白黒・FAX/リソ）と -preview.png
 * 下端8mmは安全帯。はみ出し・文字の重なりがあれば止まる。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkTextOverlap } from './lib/check-layout.mjs';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const SRC = pathToFileURL(resolve('docs/print/flyer/flyer-frame.html')).href;
const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let bad = false;
for (const [mode, name] of [['?side=front', 'flyer-a4-frame-front'], ['?side=front&mode=bw', 'flyer-a4-frame-front-bw']]) {
  const url = SRC + mode;
  const p = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.pdf({ path: `${OUT}/${name}.pdf`, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await p.locator('#page').screenshot({ path: `${OUT}/${name}-preview.png` });
  const r = await p.evaluate(() => {
    const pg = document.querySelector('.page').getBoundingClientRect();
    const f = document.querySelector('.foot').getBoundingClientRect();
    const out = [...document.querySelectorAll('.page *')].filter((e) => !e.closest('svg.art')).filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > pg.right + 1 || b.bottom > pg.bottom + 1 || b.left < pg.left - 1); }).length;
    return { gap: pg.bottom - f.bottom, out };
  });
  const { hits, checked } = await checkTextOverlap(p);
  const gapMm = (r.gap / 794 * 210).toFixed(1);
  console.log(`${name}: はみ出し ${r.out}件 / 下端まで ${gapMm}mm / 文字の重なり ${hits.length}件（${checked}箇所）`);
  if (r.out || Number(gapMm) < 7 || hits.length) { bad = true; hits.forEach((h) => console.error('   ' + h)); }
  await p.close();
}
await browser.close();
if (bad) { console.error('🔴 直してから刷ること'); process.exit(1); }
