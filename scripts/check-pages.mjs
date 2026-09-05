#!/usr/bin/env node
/*
 * 公開ページが「ブラウザで実際に描けるか」を確かめる。
 *   node scripts/check-pages.mjs
 *
 * ★2026-09-05、bv-calendar.js の整理で消し忘れた変数が1つ残っていたせいで
 *   カレンダーが描けず、しかも「先に一覧を畳んでから描く」順番だったために
 *   一覧まで消えて、ページが完全な行き止まりになった。
 *   HTMLの構文検査も node --check も、これを見つけられない。
 *   **実際に読み込んで、描けたかを見る**しかない。
 *
 * 落ちる条件:
 *   - ページの JS が例外を投げた
 *   - console.error が出た
 *   - 各ページの「これが出ていなければ壊れている」という印が無い
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const ROOT = 'docs/homepage';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// [パス, 「これが無ければ壊れている」印]
const PAGES = [
  ['/', ['#tools', '#contact', '.tool']],
  ['/calendar.html', ['.bvc-grid, .bvc table, #cal table']],
  ['/map.html', ['.spot']],
  ['/issues.html', ['.issue']],
  ['/guide.html', ['body']],
  ['/tokushoho.html', ['body']],
];

const browser = await chromium.launch();
let bad = 0;

for (const [path, musts] of PAGES) {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`JSの例外: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // 外部（地図のタイル・フォント等）の失敗は見ない。ここで見たいのは自分のコードの壊れ方
    const u = (m.location() && m.location().url) || '';
    if (u && !u.startsWith(base)) return;
    problems.push(`console.error: ${m.text()}`);
  });
  page.on('requestfailed', (r) => {
    // 外部（フォント等）は見ない。自分のサイトの中だけ
    if (r.url().startsWith(base)) problems.push(`読み込み失敗: ${r.url()}`);
  });

  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  for (const sel of musts) {
    const n = await page.locator(sel).count().catch(() => 0);
    if (!n) problems.push(`「${sel}」が1つも出ていない`);
  }

  if (problems.length) {
    bad++;
    console.log(`🔴 ${path}`);
    for (const m of problems) console.log(`     ${m}`);
  } else {
    console.log(`✅ ${path}`);
  }
  await page.close();
}

await browser.close();
server.close();

if (bad) {
  console.log(`\n${bad}ページが壊れている。公開しないこと。`);
  process.exit(1);
}
console.log('\nすべてのページがブラウザで描けている。');
