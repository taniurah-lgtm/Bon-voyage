#!/usr/bin/env node
/*
 * 園へチラシを郵送するときの送付状（宛名・住所・部数入り）を、何園ぶんでも1つのPDFにまとめる。
 *   node scripts/make-soufu.mjs --out <出力.pdf> "園名|〒|住所|部数" ["園名|〒|住所|部数|宛名" ...]
 *     宛名は省略時「園長先生」。日付と担当は手書き（ほかの送付状と同じ）。
 *   例: node scripts/make-soufu.mjs --out soufu.pdf "小平花小金井幼稚園|187-0002|東京都小平市花小金井2-9-11|50"
 *
 * 送付状: docs/print/soufu-one.html（文面は docs/print/soufu-letter.html の4枚目＝はじめての園・お電話のあと と同じ）
 * ★郵便番号は郵便番号検索で、住所と園名は園の公式で確かめてから入れる。
 * ★書体は Noto Serif JP。無いと中国語の字形に落ちる（docs/print/soufu-letter.pdf と同じ）。
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const args = process.argv.slice(2);
const o = args.indexOf('--out');
const out = o >= 0 ? args[o + 1] : null;
const specs = args.filter((a, i) => i !== o && i !== o + 1);
if (!out || !specs.length) { console.error('使い方: node scripts/make-soufu.mjs --out 出力.pdf "園名|〒|住所|部数[|宛名]" ...'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'soufu-'));
const browser = await chromium.launch();
const page = await browser.newPage();
const pages = [];
for (const [i, spec] of specs.entries()) {
  const [to, zip, addr, count, name = '園長先生'] = spec.split('|');
  if (!to || !zip || !addr || !count) { console.error(`🔴 足りない: ${spec}`); process.exit(1); }
  await page.goto(pathToFileURL(resolve('docs/print/soufu-one.html')).href + '?' + new URLSearchParams({ to, zip, addr, count, name }), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const p = join(dir, `${i}.pdf`);
  await page.pdf({ path: p, preferCSSPageSize: true, printBackground: true });
  pages.push(p);
  console.log(`  ${i + 1}. ${to}（${name}）〒${zip} ${addr}・${count}部`);
}
await browser.close();
if (pages.length === 1) execFileSync('cp', [pages[0], resolve(out)]);
else execFileSync('pdfunite', [...pages, resolve(out)]);
console.log(`wrote ${out}（${pages.length}枚）`);
