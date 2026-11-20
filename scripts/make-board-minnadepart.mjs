#!/usr/bin/env node
/*
 * みんデパ（2026-11-21・東部公園）本部に置く、ぼんぼやーじゅ通信の案内板（B3横。2026-11-20 オーナーが A3 から B3 に）。
 *   node scripts/make-board-minnadepart.mjs
 * 版下: docs/print/minnadepart/board.html（?mode=bw で白黒・?size=a3 で A3横）
 * 出力: docs/print/minnadepart/board-b3.pdf（カラー）／board-b3-bw.pdf（白黒）と -preview.png。A3横の board-a3(-bw).pdf も一緒に
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
for (const [mode, size, name] of [['color', 'b3', 'board-b3'], ['bw', 'b3', 'board-b3-bw'], ['color', 'a3', 'board-a3'], ['bw', 'a3', 'board-a3-bw']]) {
  const [W, H] = size === 'b3' ? [515, 364] : [420, 297];
  const p = await b.newPage({ viewport: { width: Math.ceil(W * 96 / 25.4), height: Math.ceil(H * 96 / 25.4) }, deviceScaleFactor: 2 });
  const qs = [mode === 'bw' && 'mode=bw', size === 'a3' && 'size=a3'].filter(Boolean).join('&');
  await p.goto(SRC + (qs ? '?' + qs : ''), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.pdf({ path: `${OUT}/${name}.pdf`, width: `${W}mm`, height: `${H}mm`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  if (size === 'b3') await p.locator('#sheet').screenshot({ path: `${OUT}/${name}-preview.png` });
  const r = await p.evaluate(() => {
    const pg = document.querySelector('.page').getBoundingClientRect();
    const fr = document.querySelector('.frame').getBoundingClientRect();
    const out = [...document.querySelectorAll('.intro *, .line *, .more *, .look *, .survey *, .foot')].filter((e) => {
      const x = e.getBoundingClientRect(); return x.width && (x.right > fr.right - 4 || x.bottom > fr.bottom - 4 || x.left < fr.left + 4 || x.top < fr.top + 4);
    }).map((e) => e.className || e.tagName);
    const imgs = [...document.querySelectorAll('img')].filter((i) => !i.naturalWidth).map((i) => i.src);
    return { out, imgs };
  });
  const { hits, checked } = await checkTextOverlap(p);
  console.log(`${name}: 枠からはみ出し ${r.out.length}件 / 文字の重なり ${hits.length}件（${checked}箇所）/ 読めない画像 ${r.imgs.length}件`);
  if (r.out.length || hits.length || r.imgs.length) { bad = true; console.error(r.out, hits, r.imgs); }
  await p.close();
}
await b.close();
if (bad) { console.error('🔴 直してから刷ること'); process.exit(1); }
