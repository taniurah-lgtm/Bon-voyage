#!/usr/bin/env node
// お店に貼るステッカー（90mm角）。docs/print/sticker/sticker.html から
//   node scripts/build-sticker.mjs
// 出力: docs/print/sticker/sticker-90mm.pdf（1枚・印刷会社に出す用）／sticker-a4-6up.pdf（A4に6枚・家でラベル用紙に）／-bw／preview.png
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkTextOverlap } from './lib/check-layout.mjs';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const SRC = pathToFileURL(resolve('docs/print/sticker/sticker.html')).href, D = 'docs/print/sticker';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 1123 }, deviceScaleFactor: 3 });
for (const [qs, out, size] of [['', 'sticker-90mm', ['90mm', '90mm']], ['?mode=bw', 'sticker-90mm-bw', ['90mm', '90mm']], ['?sheet=1', 'sticker-a4-6up', ['210mm', '297mm']], ['?sheet=1&mode=bw', 'sticker-a4-6up-bw', ['210mm', '297mm']]]) {
  await p.goto(SRC + qs, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.pdf({ path: `${D}/${out}.pdf`, width: size[0], height: size[1], printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  if (!qs || qs === '?mode=bw') await p.locator('.st').first().screenshot({ path: `${D}/${out}-preview.png` });
  const { hits } = await checkTextOverlap(p);
  console.log(out, '文字の重なり', hits.length);
}
// 3cm角の両面ミニカード（折るシール）: A4に27枚と、1枚の見本
const TAG = pathToFileURL(resolve('docs/print/sticker/tag.html')).href;
for (const [qs, out] of [['', 'tag-a4-27up'], ['?mode=bw', 'tag-a4-27up-bw']]) {
  await p.goto(TAG + qs, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.pdf({ path: `${D}/${out}.pdf`, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const { hits } = await checkTextOverlap(p);
  console.log(out, '文字の重なり', hits.length);
}
await p.goto(TAG + '?one=1', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.locator('.tag').first().screenshot({ path: `${D}/tag-preview.png` });
await b.close();
