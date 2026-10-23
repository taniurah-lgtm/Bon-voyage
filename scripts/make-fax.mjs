#!/usr/bin/env node
/*
 * 園へチラシをFAXするときの PDF（送信票＋園用チラシ）を1つにまとめる。
 *   node scripts/make-fax.mjs --to まるやまこども園 --fax 042-341-7900 --date 2026年10月23日 --out <出力.pdf>
 *     --name  宛名（省略時: 園長先生）
 *     --flyer 2枚目に付けるチラシ（省略時: 園用 flyer-a4-woodcut-en.pdf ＝ QRが /f/en）
 *
 * 送信票: docs/print/fax-cover.html（宛先は URL のパラメータで入れる）
 * ★送るのはオーナーか奥さま（eFax ならこのPDFを添付。コンビニはネットプリントで刷ってから1枚50円）。
 *   Claude は先方に送らない（docs/org.md「各部に渡さない仕事」3.）
 * ★書体は bash scripts/setup-fonts.sh ＋ Noto Serif JP。無いと中国語の字形に落ちる。
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

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const to = arg('to'), fax = arg('fax'), out = arg('out');
if (!to || !fax || !out) { console.error('使い方: node scripts/make-fax.mjs --to 園名 --fax FAX番号 --out 出力.pdf [--date 日付] [--name 宛名]'); process.exit(1); }
const flyer = resolve(arg('flyer', 'docs/homepage/assets/flyer-a4-woodcut-en.pdf'));
const q = new URLSearchParams({ to, fax, name: arg('name', '園長先生'), pages: '2' });
if (arg('date')) q.set('date', arg('date'));

const cover = join(mkdtempSync(join(tmpdir(), 'fax-')), 'cover.pdf');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve('docs/print/fax-cover.html')).href + '?' + q, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: cover, preferCSSPageSize: true, printBackground: true });
await browser.close();

execFileSync('pdfunite', [cover, flyer, resolve(out)]);
console.log(`wrote ${out}（1枚目 送信票 → ${to}・FAX ${fax}／2枚目 ${flyer.split('/').pop()}）`);
