#!/usr/bin/env node
/*
 * みんデパ（2026-11-21・東部公園）本部に置く、ぼんぼやーじゅ通信の案内板（B3横。2026-11-20 オーナーが A3 から B3 に）。
 *   node scripts/make-board-minnadepart.mjs
 * 版下: docs/print/minnadepart/board.html（?mode=bw で白黒・?size=a3 で A3横）
 * 出力: docs/print/minnadepart/board-b3.pdf（カラー）／board-b3-bw.pdf（白黒）と -preview.png。A3横の board-a3(-bw).pdf も一緒に
 *       🆕 B4縦2枚（左・右）を1つにした board-b4-2mai(-bw).pdf（2026-11-20 オーナー「B3そのまま刷れないのでB4の左と右に。自分で貼り合わせる」）
 *       B3 で、まん中のつなぎ目の左右 8mm に文字・画像がかかっていたら止まる
 * はみ出し・文字の重なりがあれば止まる。QR は3つとも読み取って飛び先を確かめる（Python の OpenCV があれば）。
 */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkTextOverlap } from './lib/check-layout.mjs';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const SRC = pathToFileURL(resolve('docs/print/minnadepart/board.html')).href;
const OUT = 'docs/print/minnadepart';
const b = await chromium.launch();
let bad = false;
const JOBS = [['color', 'b3', 'board-b3'], ['bw', 'b3', 'board-b3-bw'], ['color', 'a3', 'board-a3'], ['bw', 'a3', 'board-a3-bw'],
  ['color', 'l', 'b4-l'], ['color', 'r', 'b4-r'], ['bw', 'l', 'b4-l-bw'], ['bw', 'r', 'b4-r-bw']];
for (const [mode, size, name] of JOBS) {
  const [W, H] = size === 'b3' ? [515, 364] : size === 'a3' ? [420, 297] : [257, 364];
  const p = await b.newPage({ viewport: { width: Math.ceil(W * 96 / 25.4), height: Math.ceil(H * 96 / 25.4) }, deviceScaleFactor: 2 });
  const qs = [mode === 'bw' && 'mode=bw', size === 'a3' && 'size=a3', (size === 'l' || size === 'r') && `half=${size}`].filter(Boolean).join('&');
  await p.goto(SRC + (qs ? '?' + qs : ''), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const pdfPath = size === 'l' || size === 'r' ? `/tmp/${name}.pdf` : `${OUT}/${name}.pdf`;
  await p.pdf({ path: pdfPath, width: `${W}mm`, height: `${H}mm`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  if (size === 'b3') await p.locator('#sheet').screenshot({ path: `${OUT}/${name}-preview.png` });
  const r = await p.evaluate(() => {
    const pg = document.querySelector('.page').getBoundingClientRect();
    const fr = document.querySelector('.frame').getBoundingClientRect();
    const out = [...document.querySelectorAll('.intro *, .line *, .more *, .look *, .survey *, .foot')].filter((e) => {
      const x = e.getBoundingClientRect(); return x.width && (x.right > fr.right - 4 || x.bottom > fr.bottom - 4 || x.left < fr.left + 4 || x.top < fr.top + 4);
    }).map((e) => e.className || e.tagName);
    const imgs = [...document.querySelectorAll('img')].filter((i) => !i.naturalWidth).map((i) => i.src);
    // B3: つなぎ目（紙のまん中）の左右 8mm に、文字・画像がかかっていないか
    const sh = document.querySelector('.sheet').getBoundingClientRect(), px = sh.width / 515, cx = sh.left + sh.width / 2;
    const seam = !/half-|a3/.test(document.body.className) ? [...document.querySelectorAll('.page *')].filter((e) => {
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.tagName === 'IMG';
      const x = e.getBoundingClientRect(); return own && x.width && x.left < cx + 8 * px && x.right > cx - 8 * px;
    }).map((e) => (e.className || e.tagName) + ':' + (e.textContent || e.src || '').trim().slice(0, 12)) : [];
    return { out, imgs, seam };
  });
  const { hits, checked } = await checkTextOverlap(p);
  console.log(`${name}: 枠からはみ出し ${r.out.length}件 / 文字の重なり ${hits.length}件（${checked}箇所）/ 読めない画像 ${r.imgs.length}件` + (size === 'b3' ? ` / つなぎ目にかかる文字 ${r.seam.length}件` : ''));
  if (r.out.length || hits.length || r.imgs.length || r.seam.length) { bad = true; console.error(r.out, hits, r.imgs, r.seam); }
  await p.close();
}
await b.close();
// B4縦の左・右を、1つのPDF（1枚目＝左、2枚目＝右）に
execSync(`pdfunite /tmp/b4-l.pdf /tmp/b4-r.pdf ${OUT}/board-b4-2mai.pdf && pdfunite /tmp/b4-l-bw.pdf /tmp/b4-r-bw.pdf ${OUT}/board-b4-2mai-bw.pdf`);
console.log('board-b4-2mai(-bw).pdf: 1枚目＝左・2枚目＝右（B4縦）');
if (bad) { console.error('🔴 直してから刷ること'); process.exit(1); }
