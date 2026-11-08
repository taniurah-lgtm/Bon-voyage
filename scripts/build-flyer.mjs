#!/usr/bin/env node
/*
 * 🆕 2026-11-05 から「いつものチラシ」（片面・A4）。ロゴの花束＋細い二重線の枠。
 *   node scripts/build-flyer.mjs
 * 版下: docs/print/flyer/flyer-frame.html（?side=front・?mode=bw・?qr=）
 * 出力:
 *   docs/homepage/assets/flyer-a4.pdf / flyer-a4-bw.pdf          ★ いつもの（QR = 手渡し）
 *   docs/homepage/assets/flyer2/flyer-<code>.pdf / -bw.pdf       配る場所ごとのQR違い（scripts/build-qr.py の VENUES と同じ）
 *   docs/homepage/assets/flyer-b5.pdf / flyer-b5-bw.pdf          B5版（182×257mm・QR = 手渡し）
 * 下端8mmは安全帯。はみ出し・文字の重なりがあれば止まる。
 * 旧チラシ（表裏・2026-09〜11/4）は flyer-a4-canva-*.pdf のまま残す（旧FAXを見た園へ送るときに使う）。
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkTextOverlap } from './lib/check-layout.mjs';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const CODES = ['hand', 'asupia', 'kodomo', 'rokuto', 'seibu', 'kominkan-n', 'kominkan-s', 'library', 'jidokan', 'hokenshi', 'clinic', 'en', 'poster', 'takenoko', 'tanashi'];
const SRC = pathToFileURL(resolve('docs/print/flyer/flyer-frame.html')).href;
mkdirSync('docs/homepage/assets/flyer2', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
let bad = false;
for (const code of CODES) {
  for (const bw of [false, true]) {
    await p.goto(`${SRC}?side=front&qr=f-${code}.png${bw ? '&mode=bw' : ''}`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    const out = `docs/homepage/assets/flyer2/flyer-${code}${bw ? '-bw' : ''}.pdf`;
    await p.pdf({ path: out, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const { hits } = await checkTextOverlap(p);
    const qr = await p.evaluate(() => [...document.querySelectorAll('.qrimg')].map((i) => i.naturalWidth > 0 && i.src.split('/').pop()));
    if (hits.length || qr.some((x) => !x)) { bad = true; console.error(`🔴 ${out}: 重なり${hits.length} QR ${qr}`); }
    if (code === 'hand') {
      copyFileSync(out, `docs/homepage/assets/flyer-a4${bw ? '-bw' : ''}.pdf`);
      await p.locator('#page').screenshot({ path: `docs/homepage/assets/flyer-a4${bw ? '-bw' : ''}-preview.png` });
    }
  }
  console.log('ok', code);
}
// B5版（2026-11-08 オーナー）: いつもの（QR = 手渡し）だけ。182×257mm
for (const bw of [false, true]) {
  await p.goto(`${SRC}?side=front&size=b5&qr=f-hand.png${bw ? '&mode=bw' : ''}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  const out = `docs/homepage/assets/flyer-b5${bw ? '-bw' : ''}.pdf`;
  await p.pdf({ path: out, width: '182mm', height: '257mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const { hits } = await checkTextOverlap(p);
  if (hits.length) { bad = true; console.error(`🔴 ${out}: 重なり${hits.length}`); }
  console.log('ok', out);
}
await b.close();
if (bad) process.exit(1);
