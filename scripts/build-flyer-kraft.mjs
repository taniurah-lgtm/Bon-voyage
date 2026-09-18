#!/usr/bin/env node
/*
 * クラフト紙(A4)用・黒1色チラシの PDF / PNG を作る。
 *   node scripts/build-flyer-kraft.mjs
 *
 * 版下: docs/homepage/flyer-a4-kraft-print.html（`?paper=1` でクラフトの地色を敷いた見本）
 * 出力:
 *   docs/homepage/assets/flyer-a4-kraft.pdf         ★これを刷る。地色なし＝黒しか乗らない
 *   docs/homepage/assets/flyer-a4-kraft-preview.png  見え方の確認用（クラフトの地色つき）
 *
 * ★2つ出すのは、間違えて地色ごと刷らせないため。
 *   茶色をトナーで刷ると、紙とトナーの両方を無駄にする。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const SRC = pathToFileURL(resolve('docs/homepage/flyer-a4-kraft-print.html')).href;
const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// 印刷用（地色なし）
{
  const page = await browser.newPage();
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: `${OUT}/flyer-a4-kraft.pdf`, width: '210mm', height: '297mm',
    printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  console.log(`wrote ${OUT}/flyer-a4-kraft.pdf  ★これを刷る（黒のみ）`);
}

// 見本（クラフトの地色つき）
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto(SRC + '?paper=1', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/flyer-a4-kraft-preview.png` });
  await page.close();
  console.log(`wrote ${OUT}/flyer-a4-kraft-preview.png  （見え方の確認用）`);
}

// はみ出しの検査（版面は297mmぴったり。下端8mmは安全帯）
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const p = document.querySelector('.page');
    const f = document.querySelector('.foot').getBoundingClientRect();
    return { over: p.scrollHeight - p.clientHeight, gap: p.getBoundingClientRect().bottom - f.bottom };
  });
  await page.close();
  const gapMm = (r.gap / 794 * 210).toFixed(1);
  console.log(`  はみ出し: ${r.over}px / 最下段の文字から紙の下端まで: ${gapMm}mm`);
  if (r.over > 2) { console.error('🔴 版面からはみ出している。刷らないこと。'); process.exit(1); }
  if (Number(gapMm) < 7) { console.error('🔴 下端の余白が 7mm 未満。印刷で切れる。'); process.exit(1); }
}

await browser.close();
console.log('\n★刷るのは flyer-a4-kraft.pdf（地色なし）。preview は見え方の確認だけに使う。');
