#!/usr/bin/env node
/*
 * クラフト紙 / リソグラフ用・黒1色A4チラシ（版画）の PDF と見本PNGを作る。
 *   node scripts/build-flyer-woodcut.mjs
 *
 * 版下: docs/homepage/flyer-a4-woodcut-print.html
 *   ?v=kraft|rokuto|clinic|en … 宛先・URL・QR・注記が変わる
 *   ?paper=1                  … クラフトの地色を敷いた見本
 *
 * 出力:
 *   docs/homepage/assets/flyer-a4-woodcut-<v>.pdf         ★これを刷る（黒しか乗らない）
 *   docs/homepage/assets/flyer-a4-woodcut-<v>-preview.png  見え方の確認用（地色つき）
 *
 * ★PDFに地色を入れない。茶色をトナーで刷ると、紙もトナーも無駄になる。
 * ★紙の下端 8mm は空ける。刷って切れるのは「文字」なので、最下段の文字の箱で測る。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const SRC = pathToFileURL(resolve('docs/homepage/flyer-a4-woodcut-print.html')).href;
const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });

const VARIANTS = [
  { v: 'kraft',  label: '小平市版（汎用・手渡し / 20館 / 公民館）' },
  { v: 'rokuto', label: '多摩六都科学館版（宛先が小平・西東京。館の注記つき）' },
  { v: 'clinic', label: '小児科の待合用' },
  { v: 'en',     label: '私立園の玄関用' },
];

const browser = await chromium.launch();

for (const { v, label } of VARIANTS) {
  // 印刷用（地色なし）
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(`${SRC}?v=${v}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // ★下端の余白を測る。.foot ではなく「最下段の文字の箱」で測る。
  //   .foot は padding を含むので、そこで測ると余白が 0 に見える（2026-09-06 の失敗）。
  const gap = await page.evaluate(() => {
    const el = document.querySelector('.foot .note').textContent.trim()
      ? document.querySelector('.foot .note')
      : document.querySelector('.foot .rows');
    const r = el.getBoundingClientRect();
    return { bottom: r.bottom, page: 1123 };
  });
  const mm = (gap.page - gap.bottom) / 1123 * 297;
  const over = gap.bottom > 1123;

  await page.pdf({
    path: `${OUT}/flyer-a4-woodcut-${v}.pdf`,
    width: '210mm', height: '297mm',
    // ★背景を塗らない。紙がクラフト紙なので、地は紙の色。
    //   白の塗り（1 1 1）もPDFに入れない。罫線は border なので消えない。
    printBackground: false, margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await page.close();

  // 見本。版下には色を入れないので、**見るときだけ**後ろにクラフトの色を敷く。
  const prev = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await prev.goto(`${SRC}?v=${v}`, { waitUntil: 'networkidle' });
  await prev.evaluate(() => document.fonts.ready);
  await prev.evaluate(() => { document.documentElement.style.background = '#D8C7A8'; });
  await prev.screenshot({ path: `${OUT}/flyer-a4-woodcut-${v}-preview.png` });
  await prev.close();

  const mark = over ? '🔴 はみ出し' : (mm < 7.5 ? '⚠ 余白がせまい' : 'OK');
  console.log(`  ${v.padEnd(7)} ${mark}  最下段の文字から紙の下端まで ${mm.toFixed(1)}mm  ← ${label}`);
}

await browser.close();
console.log(`\n${VARIANTS.length}版を出力しました（PDF＝黒のみ / PNG＝地色つきの見本）。`);
