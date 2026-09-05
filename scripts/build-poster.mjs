#!/usr/bin/env node
/*
 * A4カラーポスターの PDF / PNG を作り直す。
 *   node scripts/build-poster.mjs
 *
 * 版下: docs/homepage/poster-a4-color-print.html（`?bleed=1` で塗り足し版）
 * 出力:
 *   docs/homepage/assets/poster-a4-color.pdf       210×297mm（コンビニ・家庭用プリンタ）
 *   docs/homepage/assets/poster-a4-color-bleed.pdf 216×303mm（印刷所入稿・塗り足し3mm）
 *   docs/homepage/assets/poster-a4-color.png       見本用のラスタ（150dpi相当）
 *
 * ★これまで作り直す手立てがリポジトリに無く、毎回ゼロからだった。
 *   版下を直したらこれを走らせる。
 * ★中身の「賞味期限」は docs/distribution.md の表を見ること。
 *   日付入りの内容が入っているので、期限を過ぎたら刷らない。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const SRC = pathToFileURL(resolve('docs/homepage/poster-a4-color-print.html')).href;
const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const [name, url, w, h] of [
  ['poster-a4-color.pdf', SRC, '210mm', '297mm'],
  ['poster-a4-color-bleed.pdf', SRC + '?bleed=1', '216mm', '303mm'],
]) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: `${OUT}/${name}`, width: w, height: h, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  console.log(`wrote ${OUT}/${name} (${w}×${h})`);
}

// 見本用のPNG。
// ★版下は mm で組んである。CSSの96dpiで 210mm = 793.7px なので、ビューポートは px で
//   794×1123 にする。ここを 1240×1754 にすると版面がビューポートより小さくなり、
//   下が切れた絵になる（実際にそうなった）。倍率は deviceScaleFactor で上げる。
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/poster-a4-color.png` });
  await page.close();
  console.log(`wrote ${OUT}/poster-a4-color.png (1588x2246)`);
}

await browser.close();
console.log('★ 中身の賞味期限は docs/distribution.md の表を確認すること');
