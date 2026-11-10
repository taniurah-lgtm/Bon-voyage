#!/usr/bin/env node
/*
 * 協賛の領収書・請求書（発行：ニコマル）を PDF にする。版下: docs/print/kyosan/receipt.html
 *   node scripts/make-kyosan-doc.mjs --kind receipt|invoice --to "宛名" --amount 3000 --item "但し書き・品目"
 *        [--no 番号] [--date YYYY-MM-DD] [--due YYYY-MM-DD] [--addr "ニコマルの住所"] [--bank "振込先"] --out 出力.pdf
 * 🔒 住所と振込先はリポジトリに書かない。ここで渡して、PDF は作業場所（scratchpad）に出す。渡さなければ空欄（手書き）。
 * 書体は Google Fonts（Shippori Mincho B1・Zen Kaku Gothic New）。印鑑は印刷したあと「印」の枠に押す。
 */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const a = process.argv.slice(2), opt = {};
for (let i = 0; i < a.length; i += 2) opt[a[i].replace(/^--/, '')] = a[i + 1];
if (!opt.out) { console.error('使い方: node scripts/make-kyosan-doc.mjs --kind receipt|invoice --to 宛名 --amount 3000 --item 但し書き --out 出力.pdf'); process.exit(1); }
const q = new URLSearchParams();
for (const k of ['kind', 'to', 'amount', 'item', 'no', 'date', 'due', 'addr', 'bank']) if (opt[k]) q.set(k, opt[k]);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(pathToFileURL(resolve('docs/print/kyosan/receipt.html')).href + '?' + q, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.pdf({ path: opt.out, width: '210mm', height: '297mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await b.close();
console.log('wrote', opt.out);
