#!/usr/bin/env node
/*
 * 🆕 2026-11-27 オーナー「黒とプラス2色の計3色版」。いつものチラシ（花の枠・表）を、リソグラフの版に分けた版下。
 *   同日、色を強めにした別の版下（flyer-riso3.html）も作ったが、オーナー「やっぱりこれ（花の枠の3色版）がいい。2色版も作りたい」。
 *
 *   node scripts/build-flyer-riso3.mjs            （QR = 手渡し /f/hand）
 *   node scripts/build-flyer-riso3.mjs asupia     （QR を配布先コードに。scripts/build-qr.py の配布先と同じ）
 *   node scripts/build-flyer-riso3.mjs --bold     （色を強めにした版下 flyer-riso3.html の3色版。いまは刷らない）
 * 版下: docs/print/flyer/flyer-frame.html?side=front&mode=riso3&plate=k|c1|c2|k2
 * 出力:
 *   docs/homepage/assets/flyer-a4-riso3[-<code>].pdf   3色版。[1] 黒版 [2] 色版1（暖色） [3] 色版2（寒色）
 *   docs/homepage/assets/flyer-a4-riso2[-<code>].pdf   2色版。[1] 黒版（3色版の黒版と色版2を1枚にまとめたもの） [2] 赤版（3色版の色版1と同じ）
 *   ...-preview.png（3色: 赤＋青）／-preview-green.png（3色: 赤＋緑）／flyer-a4-riso2-preview.png（2色: 黒＋赤）
 *   🆕 docs/homepage/assets/flyer-a4-riso2-overlay.pdf        家のプリンターで、あすぴあで刷った黒（2色版の1ページ目）に重ねるカラーの版
 *      flyer-a4-riso2-overlay-check.pdf  同じものに、枠の線を赤紫の細い線で足した位置合わせ用
 *      flyer-a4-riso2-overlay-preview.png  黒に重ねた見本
 *      ずれを直すとき: node scripts/build-flyer-riso3.mjs --dx=1.5 --dy=-1（mm。右・下がプラス）
 *   どの版も黒1色で出す（色はドラムが乗せる）。
 * 刷る順は 色の版 → 黒版（黒をいちばん上に）。淡い色は網点を入れてあるので、原稿は「文字」モードでよい。
 * はみ出し・文字の重なり（版ごと、と全部の版を重ねたとき）があれば止まる。
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

const args = process.argv.slice(2);
const bold = args.includes('--bold');
const code = args.find((a) => !a.startsWith('--')) || '';
const num = (k) => parseFloat((args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]) || 0;
const dx = num('dx'), dy = num('dy');
const suffix = (code ? '-' + code : '') + (bold ? '-bold' : '');
const OUT = 'docs/homepage/assets';
const SRC = bold ? pathToFileURL(resolve('docs/print/flyer/flyer-riso3.html')).href + '?x=1'
                 : pathToFileURL(resolve('docs/print/flyer/flyer-frame.html')).href + '?side=front&mode=riso3';
const LABEL = { k: '黒版', c1: '色版1（暖色）', c2: '色版2（寒色）', k2: '2色版の黒版' };
const K = '#2B2A29', RED = '#FF665E', BLUE = '#0078BF', GREEN = '#00A95C';  // 見本の色（理想科学のインクに近いもの）
const SETS = [
  { name: 'riso3', plates: ['k', 'c1', 'c2'], previews: { '': { c1: RED, c2: BLUE, k: K }, '-green': { c1: RED, c2: GREEN, k: K } } },
  ...(bold ? [] : [{ name: 'riso2', plates: ['k2', 'c1'], previews: { '': { c1: RED, k2: K } } }]),
];
mkdirSync(OUT, { recursive: true });
const tmp = resolve(tmpdir(), `riso-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3 });
let bad = false;
const pdfs = {}, pngs = {};
for (const plate of [...new Set(SETS.flatMap((s) => s.plates))]) {
  await p.goto(`${SRC}&plate=${plate}${code ? `&qr=f-${code}.png` : ''}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  pdfs[plate] = `${tmp}/${plate}.pdf`;
  await p.pdf({ path: pdfs[plate], width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  pngs[plate] = (await p.screenshot({ clip: { x: 0, y: 0, width: 794, height: 1123 } })).toString('base64');
  const r = await p.evaluate(() => {
    const pg = document.querySelector('.page').getBoundingClientRect();
    const f = document.querySelector('.foot').getBoundingClientRect();
    const out = [...document.querySelectorAll('.page *')].filter((e) => !e.closest('svg.art')).filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > pg.right + 1 || b.bottom > pg.bottom + 1 || b.left < pg.left - 1); }).length;
    return { gap: pg.bottom - f.bottom, out };
  });
  const { hits, checked } = await checkTextOverlap(p);
  const gapMm = (r.gap / 794 * 210).toFixed(1);
  console.log(`${LABEL[plate]}: はみ出し ${r.out}件 / 下端まで ${gapMm}mm / 文字の重なり ${hits.length}件（${checked}箇所）`);
  if (r.out || Number(gapMm) < 7 || hits.length) { bad = true; hits.forEach((h) => console.error('   ' + h)); }
  if (plate === 'k') {
    // 全部の版を重ねたとき（ほかの版の文字とも重ならないか）
    await p.addStyleTag({ content: '.page *{ visibility:visible !important; }' });
    const all = await checkTextOverlap(p);
    console.log(`全部の版を重ねて: 文字の重なり ${all.hits.length}件（${all.checked}箇所）`);
    if (all.hits.length) { bad = true; all.hits.forEach((h) => console.error('   ' + h)); }
  }
}

for (const set of SETS) {
  const outPdf = `${OUT}/flyer-a4-${set.name}${suffix}.pdf`;
  execFileSync('pdfunite', [...set.plates.map((pl) => pdfs[pl]), outPdf]);
  console.log('書き出し:', outPdf, `（${set.plates.map((pl, i) => `${i + 1} ${LABEL[pl]}`).join(' / ')}）`);
  // 各版のページに何か刷られているか（真っ白の版が無いか）
  execFileSync('pdftoppm', ['-r', '20', '-gray', outPdf, `${tmp}/chk`]);
  set.plates.forEach((pl, i) => {
    const f = `${tmp}/chk-${i + 1}.pgm`;
    const buf = readFileSync(f);
    const [w, h] = buf.toString('latin1', 0, 40).split(/\s+/).slice(1, 3).map(Number);
    const dark = [...buf.subarray(buf.length - w * h)].filter((v) => v < 128).length;
    if (dark < 20) { console.error(`🔴 ${set.name} の ${i + 1}ページ目にほとんど何も無い`); bad = true; }
    rmSync(f);
  });
  // 見本: 各版（黒＝インク・白＝紙）を、インクの色に置きかえて掛け合わせる（リソのインクは重なると混ざる）
  for (const [name, ink] of Object.entries(set.previews)) {
    const order = [...set.plates.filter((pl) => !pl.startsWith('k')), ...set.plates.filter((pl) => pl.startsWith('k'))];
    const layer = (pl) => `<div class="l" style="background:${ink[pl]}"><img src="data:image/png;base64,${pngs[pl]}"></div>`;
    await p.setContent(`<!doctype html><style>
      html,body{margin:0;background:#fff}
      .s{position:relative;width:794px;height:1123px;background:#FDFCF8;isolation:isolate}
      .l{position:absolute;inset:0;mix-blend-mode:multiply}
      .l img{width:794px;height:1123px;display:block;mix-blend-mode:screen}
    </style><div class="s">${order.map(layer).join('')}</div>`);
    await p.waitForTimeout(200);
    const f = `${OUT}/flyer-a4-${set.name}${suffix}-preview${name}.png`;
    await p.locator('.s').screenshot({ path: f });
    console.log('見本:', f);
  }
}
// 家で重ねるカラーの版（2色版の黒に重ねる）
if (!bold) {
  const ovUrl = (check) => `${SRC}&plate=ov${code ? `&qr=f-${code}.png` : ''}${dx ? `&dx=${dx}` : ''}${dy ? `&dy=${dy}` : ''}${check ? '&check=1' : ''}`;
  for (const [check, name] of [[false, 'overlay'], [true, 'overlay-check']]) {
    await p.goto(ovUrl(check), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    const f = `${OUT}/flyer-a4-riso2${suffix}-${name}.pdf`;
    await p.pdf({ path: f, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log('書き出し:', f, dx || dy ? `（ずらし 右${dx}mm・下${dy}mm）` : '');
    if (!check) pngs.ov = (await p.screenshot({ clip: { x: 0, y: 0, width: 794, height: 1123 } })).toString('base64');
  }
  await p.setContent(`<!doctype html><style>
    html,body{margin:0;background:#fff}
    .s{position:relative;width:794px;height:1123px;background:#FDFCF8;isolation:isolate}
    .l{position:absolute;inset:0;mix-blend-mode:multiply}
    .l img{width:794px;height:1123px;display:block}
    .k img{mix-blend-mode:screen}
  </style><div class="s"><div class="l"><img src="data:image/png;base64,${pngs.ov}"></div><div class="l k" style="background:${K}"><img src="data:image/png;base64,${pngs.k2}"></div></div>`);
  await p.waitForTimeout(200);
  const f = `${OUT}/flyer-a4-riso2${suffix}-overlay-preview.png`;
  await p.locator('.s').screenshot({ path: f });
  console.log('見本:', f);
}
await b.close();
rmSync(tmp, { recursive: true, force: true });
if (bad) { console.error('🔴 直してから刷ること'); process.exit(1); }
