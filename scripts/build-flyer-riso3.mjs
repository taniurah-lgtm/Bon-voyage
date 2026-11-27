#!/usr/bin/env node
/*
 * 🆕 2026-11-27 オーナー「黒とプラス2色の計3色版」。いつものチラシ（花の枠・表）を、リソグラフ3色に分けた版下。
 *   node scripts/build-flyer-riso3.mjs            （QR = 手渡し /f/hand）
 *   node scripts/build-flyer-riso3.mjs asupia     （QR を配布先コードに。scripts/build-qr.py の配布先と同じ）
 * 版下: docs/print/flyer/flyer-frame.html?side=front&mode=riso3&plate=k|c1|c2
 * 出力:
 *   docs/homepage/assets/flyer-a4-riso3[-<code>].pdf      3ページ。[1] 黒版 [2] 色版1（暖色） [3] 色版2（寒色）。どれも黒1色で出す
 *   docs/homepage/assets/flyer-a4-riso3[-<code>]-preview.png         刷り上がりの見本（赤＋青のインクで重ねたもの）
 *   docs/homepage/assets/flyer-a4-riso3[-<code>]-preview-green.png   同じ版を、赤＋緑のインクで重ねた見本
 * 刷る順は 色版1 → 色版2 → 黒版（黒をいちばん上に）。淡い色は網点を入れてあるので、原稿は「文字」モードでよい。
 * 黒版で、はみ出し・文字の重なりがあれば止まる。
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { checkTextOverlap } from './lib/check-layout.mjs';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const code = process.argv[2] || '';
const suffix = code ? '-' + code : '';
const OUT = 'docs/homepage/assets';
const SRC = pathToFileURL(resolve('docs/print/flyer/flyer-frame.html')).href;
const PLATES = [['k', '黒版'], ['c1', '色版1（暖色）'], ['c2', '色版2（寒色）']];
// 見本の色（理想科学のインクの色に近いもの）。版は色に関係なく同じ
const INKS = {
  '': { k: '#2B2A29', c1: '#FF665E', c2: '#0078BF' },       // 赤＋青
  '-green': { k: '#2B2A29', c1: '#FF665E', c2: '#00A95C' },  // 赤＋緑
};
mkdirSync(OUT, { recursive: true });
const tmp = resolve(tmpdir(), `riso3-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3 });
let bad = false;
const pdfs = [], pngs = {};
for (const [plate, label] of PLATES) {
  const url = `${SRC}?side=front&mode=riso3&plate=${plate}${code ? `&qr=f-${code}.png` : ''}`;
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const f = `${tmp}/${plate}.pdf`;
  await p.pdf({ path: f, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  pdfs.push(f);
  pngs[plate] = (await p.screenshot({ clip: { x: 0, y: 0, width: 794, height: 1123 } })).toString('base64');
  if (plate === 'k') {
    const r = await p.evaluate(() => {
      const pg = document.querySelector('.page').getBoundingClientRect();
      const f = document.querySelector('.foot').getBoundingClientRect();
      const out = [...document.querySelectorAll('.page *')].filter((e) => !e.closest('svg.art')).filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > pg.right + 1 || b.bottom > pg.bottom + 1 || b.left < pg.left - 1); }).length;
      return { gap: pg.bottom - f.bottom, out };
    });
    const { hits, checked } = await checkTextOverlap(p);
    const gapMm = (r.gap / 794 * 210).toFixed(1);
    console.log(`${label}: はみ出し ${r.out}件 / 下端まで ${gapMm}mm / 文字の重なり ${hits.length}件（${checked}箇所）`);
    if (r.out || Number(gapMm) < 7 || hits.length) { bad = true; hits.forEach((h) => console.error('   ' + h)); }
  }
}
const outPdf = `${OUT}/flyer-a4-riso3${suffix}.pdf`;
execFileSync('pdfunite', [...pdfs, outPdf]);
console.log('書き出し:', outPdf, '（1 黒版 / 2 色版1 / 3 色版2）');

// 見本: 各版（黒＝インク・白＝紙）を、インクの色に置きかえて掛け合わせる（リソのインクは重なると混ざる）
for (const [name, ink] of Object.entries(INKS)) {
  const layer = (plate) => `<div class="l" style="background:${ink[plate]}"><img src="data:image/png;base64,${pngs[plate]}"></div>`;
  await p.setContent(`<!doctype html><style>
    html,body{margin:0;background:#fff}
    .s{position:relative;width:794px;height:1123px;background:#FDFCF8;isolation:isolate}
    .l{position:absolute;inset:0;mix-blend-mode:multiply}
    .l img{width:794px;height:1123px;display:block;mix-blend-mode:screen}
  </style><div class="s">${layer('c1')}${layer('c2')}${layer('k')}</div>`);
  await p.waitForTimeout(200);
  const f = `${OUT}/flyer-a4-riso3${suffix}-preview${name}.png`;
  await p.locator('.s').screenshot({ path: f });
  console.log('見本:', f);
}
await b.close();
rmSync(tmp, { recursive: true, force: true });

// 各版のページに何か刷られているか（真っ白の版が無いか）
execFileSync('pdftoppm', ['-r', '20', '-gray', '-f', '1', '-l', '3', outPdf, `${tmp}-chk`]);
for (const n of ['1', '2', '3']) {
  const f = `${tmp}-chk-${n}.pgm`;
  const buf = readFileSync(f);
  const [w, h] = buf.toString('latin1', 0, 40).split(/\s+/).slice(1, 3).map(Number);
  const dark = [...buf.subarray(buf.length - w * h)].filter((v) => v < 128).length;
  if (dark < 20) { console.error(`🔴 ${n}ページ目にほとんど何も無い`); bad = true; }
  rmSync(f);
}
if (bad) { console.error('🔴 直してから刷ること'); process.exit(1); }
