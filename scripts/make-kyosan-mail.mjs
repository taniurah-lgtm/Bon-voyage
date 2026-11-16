#!/usr/bin/env node
/*
 * 郵送の営業（協賛のご案内・チラシのお願い）を、送り先の一覧から一気に刷れる形にする。
 *   node scripts/make-kyosan-mail.mjs --list data/kyosan-mail/2026-11-16.json --out <出力フォルダ> [--from "封筒の裏の差出人"]
 *
 * 出力（出力フォルダに）:
 *   letters-b5.pdf … 協賛のお手紙（B5・1人1枚・片面。2026-11-16 オーナー「協賛の手紙はB5に」）
 *   letters-a4.pdf … チラシのお願い（A4・1人1枚・片面）。どちらも三つ折りにして封筒へ
 *   labels.pdf    … 宛名ラベル（A4 12面）。--from を渡すと、差出人ラベルの1枚も足す
 *   checklist.txt … 送り先ごとの型・同封物・切手の目安
 *
 * 一覧（JSON）: { "date": "YYYY-MM-DD", "items": [ { type, to, sub?, honor?, zip, addr, addr2?, reasonsTitle?, reasons[], ... } ] }
 *   type は shokai（紹介型）／ouen（応援型）／chirashi（チラシのお願い・お金の話なし）。文面の決まりは docs/kyosan-mail.md
 * 🔒 差出人の住所はリポジトリに書かない（--from で渡すだけ）。振込先・電話はお手紙に書かない。
 * ★郵便番号は、町名から引いて確かめてから一覧に入れる（docs/kyosan-mail.md「郵便番号」）。
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const a = process.argv.slice(2), opt = {};
for (let i = 0; i < a.length; i += 2) opt[a[i].replace(/^--/, '')] = a[i + 1];
if (!opt.list || !opt.out) {
  console.error('使い方: node scripts/make-kyosan-mail.mjs --list data/kyosan-mail/<日付>.json --out <出力フォルダ> [--from "差出人"]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(opt.list, 'utf8'));
const items = data.items || [];
const TYPES = { shokai: '紹介型', ouen: '応援型', chirashi: 'チラシのお願い' };

// 送る前に止める（書いてはいけないものが入っていないか・宛先が欠けていないか）
const bad = [];
for (const [i, r] of items.entries()) {
  const who = `${i + 1}. ${r.to || '(宛名なし)'}`;
  if (!TYPES[r.type]) bad.push(`${who}: type が ${r.type}（shokai/ouen/chirashi のどれか）`);
  if (!r.to || !r.zip || !r.addr) bad.push(`${who}: 宛名・郵便番号・住所のどれかが無い`);
  if (r.zip && !/^\d{3}-\d{4}$/.test(r.zip)) bad.push(`${who}: 郵便番号は 123-4567 の形で`);
  const text = JSON.stringify(r);
  if (/0[789]0-?\d{4}-?\d{4}/.test(text)) bad.push(`${who}: 携帯番号らしきものが入っている`);
  if (r.type === 'chirashi' && /協賛|広告|PR|料金|円/.test([r.lead, r.ask, ...(r.reasons || [])].join(' '))) {
    bad.push(`${who}: チラシのお願いに、お金や協賛の話が入っている（医療機関には特に書かない）`);
  }
  if (/おすすめ|子連れにやさしい|一番|No\.?1|必ず/.test((r.reasons || []).join(' '))) bad.push(`${who}: 評価の言葉が入っている`);
}
if (bad.length) { console.error('🔴 止めました:\n  ' + bad.join('\n  ')); process.exit(1); }

const outDir = resolve(opt.out);
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'kyosan-mail-'));
const browser = await chromium.launch();
const page = await browser.newPage();

// お手紙（協賛＝B5、チラシのお願い＝A4。紙の大きさが違うので、ファイルを分ける）
const pdfs = { b5: [], a4: [] };
for (const [i, r] of items.entries()) {
  await page.goto(pathToFileURL(resolve('docs/print/kyosan/mail-letter.html')).href + '?blank', { waitUntil: 'networkidle' });
  await page.evaluate((d) => window.render(d), { date: data.date, ...r });
  await page.evaluate(() => document.fonts.ready);
  // 1枚に収まっているか（はみ出すと三つ折りで2枚になり、重さも変わる）
  const over = await page.evaluate(() => { const p = document.querySelector('.page'); return p.scrollHeight - p.clientHeight; });
  if (over > 2) { console.error(`🔴 ${r.to}: お手紙が1枚に収まらない（${over}px あふれ）。理由の行を減らす`); process.exit(1); }
  const p = join(tmp, `${String(i).padStart(3, '0')}.pdf`);
  await page.pdf({ path: p, preferCSSPageSize: true, printBackground: true });
  pdfs[r.type === 'chirashi' ? 'a4' : 'b5'].push(p);
}
const outFiles = [];
for (const [k, list] of Object.entries(pdfs)) {
  if (!list.length) continue;
  const f = join(outDir, `letters-${k}.pdf`);
  if (list.length === 1) execFileSync('cp', [list[0], f]);
  else execFileSync('pdfunite', [...list, f]);
  outFiles.push(`letters-${k}.pdf`);
}

// 宛名ラベル
await page.goto(pathToFileURL(resolve('docs/print/kyosan/mail-label.html')).href + '?blank', { waitUntil: 'networkidle' });
await page.evaluate(([list, from]) => window.render(list, from), [items.map(({ zip, addr, addr2, to, sub, honor }) => ({ zip, addr, addr2, to, sub, honor })), opt.from || '']);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: join(outDir, 'labels.pdf'), preferCSSPageSize: true, printBackground: true });
await browser.close();

// 送る前の確認表
const enc = (r) => r.enclosed || (r.type === 'chirashi' ? `チラシ ${r.copies || 5}部` : '通信のチラシ 1部');
const lines = [
  `郵送の営業 ${data.date}（${items.length}通）`,
  '',
  '■ 1通ごと',
  ...items.map((r, i) => `${String(i + 1).padStart(2)}. [${TYPES[r.type]}] ${r.to}${r.sub ? `（${r.sub}）` : ''} ${r.honor || '御中'}　〒${r.zip} ${r.addr}${r.addr2 ? ' ' + r.addr2 : ''}\n     同封: お手紙1枚（三つ折り）＋${enc(r)}`),
  '',
  '■ 紙と封筒',
  '  協賛のお手紙は B5（letters-b5.pdf・B5の紙に刷る）、チラシのお願いは A4（letters-a4.pdf）。',
  '  B5を三つ折り＝約18×8.6cm → 長3封筒（12×23.5cm）にも長4封筒（9×20.5cm）にも入る。',
  '  同封のチラシが A4 なら長3封筒。B5版のチラシ（flyer-b5.pdf）を三つ折りにすれば長4封筒でそろう。',
  '',
  '■ 切手',
  '  長3・長4封筒・50gまで＝定形 110円。お手紙1枚（約4g）＋チラシ5部（約20g）＋封筒（約5g）でも 30g ほど。',
  '  厚さは1cmまで（三つ折りで6枚なら2mmほど）。はみ出す・重いと定形外（140円〜）になる。',
  `  ${items.length}通 × 110円 ＝ ${(items.length * 110).toLocaleString()}円`,
  '',
  '■ 送ったら',
  '  Claude に「送った」と伝える → Notion（協賛のアポリスト／チラシのアポリスト）の状態を「資料を渡した」、最終連絡を今日に。',
  '  返事はメールで来る。来たら、そのメールを Claude に指す。',
];
writeFileSync(join(outDir, 'checklist.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nwrote ${outDir}/${outFiles.join('・')}・labels.pdf・checklist.txt`);
