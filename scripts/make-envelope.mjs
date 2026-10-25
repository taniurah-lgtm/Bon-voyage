#!/usr/bin/env node
/*
 * 園へチラシを郵送するときの封筒の宛名ラベルを、何園ぶんでも1つのPDFにまとめる（1園＝A4 1枚）。
 *   node scripts/make-envelope.mjs --out <出力.pdf> --from "〒|住所|名前" "園名|〒|住所[|宛名]" ...
 *     宛名は省略時「園長先生」。差出人の団体名は「ぼんぼやーじゅ通信の会」。
 *   例: node scripts/make-envelope.mjs --out label.pdf --from "187-xxxx|東京都小平市…|谷裏 弘晃" "小平花小金井幼稚園|187-0002|東京都小平市花小金井2-9-11"
 *
 * ラベル: docs/print/envelope-label.html（A4に刷って点線で切り、角形2号の表に宛名、裏に差出人を貼る）
 * 🔒 差出人の住所はリポジトリに書かない（スクリプトにも、ラベルの型にも）。刷るときに --from で渡し、PDFは作業場所に置く。
 * ★郵便番号は郵便番号検索で、住所と園名は園の公式で確かめてから入れる（make-soufu.mjs と同じ）。
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
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt('--out');
const from = opt('--from');
const specs = args.filter((a, i) => !['--out', '--from'].includes(a) && !['--out', '--from'].includes(args[i - 1]));
if (!out || !from || !specs.length) { console.error('使い方: node scripts/make-envelope.mjs --out 出力.pdf --from "〒|住所|名前" "園名|〒|住所[|宛名]" ...'); process.exit(1); }
const [fzip, faddr, fname] = from.split('|');
if (!fzip || !faddr || !fname) { console.error('🔴 --from は "〒|住所|名前" の3つ'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'envelope-'));
const browser = await chromium.launch();
const page = await browser.newPage();
const pages = [];
for (const [i, spec] of specs.entries()) {
  const [to, zip, addr, name = '園長先生'] = spec.split('|');
  if (!to || !zip || !addr) { console.error(`🔴 足りない: ${spec}`); process.exit(1); }
  await page.goto(pathToFileURL(resolve('docs/print/envelope-label.html')).href + '?' + new URLSearchParams({ to, zip, addr, name, fzip, faddr, fname }), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const p = join(dir, `${i}.pdf`);
  await page.pdf({ path: p, preferCSSPageSize: true, printBackground: true });
  pages.push(p);
  console.log(`  ${i + 1}. ${to}（${name}）〒${zip} ${addr}`);
}
await browser.close();
if (pages.length === 1) execFileSync('cp', [pages[0], resolve(out)]);
else execFileSync('pdfunite', [...pages, resolve(out)]);
console.log(`wrote ${out}（${pages.length}枚）`);
