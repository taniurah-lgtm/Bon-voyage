#!/usr/bin/env node
/*
 * Canva版レイアウトのチラシ（HTMLに移したもの）の PDF / PNG を作る。
 *   node scripts/build-flyer-hokenshi.mjs
 *
 * 版下: docs/homepage/flyer-a4-canva-print.html
 * 出力:
 *   docs/homepage/assets/flyer-a4-canva-html.pdf          ★これを刷る
 *   docs/homepage/assets/flyer-a4-canva-html-preview.png   画面で見え方を確かめる用
 *
 * ★下端8mmは安全帯。家庭用プリンタもコンビニも紙のふちまでは刷れず、
 *   「用紙に合わせる」を選ぶと縮むので、最下段の文字は必ず8mm上で止める。
 *   （2026-09 にポスターの最終行が切れて刷り直しになった。同じ轍を踏まない）
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

const SRC = pathToFileURL(resolve('docs/homepage/flyer-a4-canva-print.html')).href;
const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// 印刷用
{
  const page = await browser.newPage();
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: `${OUT}/flyer-a4-canva-html.pdf`, width: '210mm', height: '297mm',
    printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  console.log(`wrote ${OUT}/flyer-a4-canva-html.pdf  ★これを刷る`);
}

// 画面確認用
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/flyer-a4-canva-html-preview.png` });
  await page.close();
  console.log(`wrote ${OUT}/flyer-a4-canva-html-preview.png    （見え方の確認用）`);
}

// はみ出しの検査（版面は297mmぴったり。下端8mmは安全帯）
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(SRC, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const p = document.querySelector('.page');
    // ★ .foot の矩形は padding-bottom を含むので、そこで測ると余白が 0 に見える。
    //   刷って切れるのは「文字」なので、最下段の文字の箱で測る。
    const f = document.querySelector('.foot').getBoundingClientRect();
    return { over: p.scrollHeight - p.clientHeight, gap: p.getBoundingClientRect().bottom - f.bottom };
  });
  const { hits: laps, checked } = await checkTextOverlap(page);
  await page.close();
  const gapMm = (r.gap / 794 * 210).toFixed(1);
  console.log(`  はみ出し: ${r.over}px / 下端まで: ${gapMm}mm / 文字の重なり: ${laps.length}件（${checked}箇所を照合）`);
  if (r.over > 2) { console.error('🔴 版面からはみ出している。刷らないこと。'); process.exit(1); }
  if (Number(gapMm) < 7) { console.error('🔴 下端の余白が 7mm 未満。印刷で切れる。'); process.exit(1); }
  if (laps.length) {
    console.error('🔴 文字どうしが重なっている。刷らないこと。');
    laps.forEach(l => console.error('   ' + l));
    process.exit(1);
  }
}

await browser.close();
console.log('\n★刷るのは flyer-a4-canva-html.pdf。preview は見え方の確認だけに使う。');
