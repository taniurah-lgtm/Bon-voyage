#!/usr/bin/env node
/*
 * 協賛のご案内（/kyosan/）の画像とPDFを作る。
 *   node scripts/make-kyosan.mjs
 *
 * 出力:
 *   docs/homepage/kyosan/img/flyer-kyosan.png … チラシ裏面に協賛欄を入れた見本（掲載イメージ ③）
 *   docs/homepage/kyosan/img/map-pr.jpg       … おでかけマップに「PR」のピンを立てた見本（掲載イメージ ④）
 *   docs/homepage/kyosan/bonvoya-kyosan.pdf   … 媒体資料（A4・2ページ。版下 kyosan/print.html）
 *   docs/homepage/kyosan/moushikomi.pdf       … 掲載申込書（A4・1枚。版下 kyosan/moushikomi.html）
 *
 * ★2026-10-27 オーナー指示（読者200人を前に、協賛の営業を始める）。docs/sponsor-plan.md §14。
 *   見本の店名は「〇〇」だけにする（実在のお店と取り違えられない）。
 *   チラシ・マップは本物の画面に、見本の協賛を差し込んで撮る。本物のファイルは書き換えない。
 *
 * 🔴 書体: この箱の既定は IPAゴシックだけ。先に `bash scripts/setup-fonts.sh`（Zen Maru Gothic など）。
 *    本文の Noto Sans JP も要る（~/.fonts に無ければ PDF の本文が IPAゴシックになる）。
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const ROOT = 'docs/homepage';
const OUT = `${ROOT}/kyosan`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

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
await mkdir(`${OUT}/img`, { recursive: true });

const browser = await chromium.launch();

// 見本の協賛（掲載イメージ・資料と同じ「〇〇」）
const SUPPORTERS = ['〇〇小児科', '〇〇歯科', '〇〇不動産', '〇〇整体院', '〇〇保険'];

// ---- ③ チラシの裏面に協賛欄 ----
{
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/flyer-a4-canva-back.html`, { waitUntil: 'networkidle' });
  // 協賛欄のぶん（約12mm）、ほかの余白を少しずつ詰める。本物の版下（flyer-a4-canva-back.html）は書き換えない。
  // ★実際に刷る版に入れるときは、版下に同じ詰め方を入れて、下端の安全帯（8mm）を測り直す
  await page.addStyleTag({ content: `
    .hd { padding: 6.4mm 15mm 4mm !important; }
    h2 { margin: 3mm 0 2mm !important; }
    .rows { gap: 1mm !important; }
    .row { padding: 1.5mm 3.8mm !important; }
    .three { margin-top: 2.8mm !important; }
    .promise { margin-top: 1.8mm !important; padding: 1.8mm 3.8mm !important; }
    .cta { margin-top: 2.2mm !important; padding: 2.6mm 4.4mm !important; }
    .kyo { margin: 2.2mm 0 0; padding: 1.6mm 3.2mm 1.8mm; border: .35mm solid #232323; border-radius: 2mm;
           display: flex; align-items: center; gap: 3mm; font-family: "Zen Maru Gothic", sans-serif;
           outline: 1.1mm solid #2C7C9E; outline-offset: 1.2mm; }
    .kyo b { flex: none; font-size: 2.7mm; letter-spacing: .1em; color: #fff; background: #232323; border-radius: 1mm; padding: .5mm 1.6mm; }
    .kyo .t { font-size: 2.45mm; color: #4A4A4A; line-height: 1.5; }
    .kyo .n { display: block; font-size: 2.9mm; color: #1E1E1E; letter-spacing: .04em; font-weight: 700; }
  ` });
  await page.evaluate((names) => {
    const foot = document.querySelector('.foot');
    const box = document.createElement('div');
    box.className = 'kyo';
    box.innerHTML = `<b>協賛</b><span class="t">この通信は、次の方々のご協賛で運営しています。<span class="n">${names.join('　')}</span></span>`;
    foot.parentNode.insertBefore(box, foot);
  }, SUPPORTERS);
  await page.waitForTimeout(400);
  // 下のほう（約束の枠・QRの案内・協賛欄・発行者欄）だけ切り出す。スマホの幅で場所が分かる大きさにするため
  const top = await page.evaluate(() => document.querySelector('.promise').getBoundingClientRect().top - 14);
  const bottom = await page.evaluate(() => document.querySelector('.page').getBoundingClientRect().bottom);
  const gapMm = await page.evaluate(() => {
    const pg = document.querySelector('.page').getBoundingClientRect();
    return (pg.bottom - document.querySelector('.foot').getBoundingClientRect().bottom) / (96 / 25.4);
  });
  console.log(`  チラシ: 発行者欄の下から紙の下端まで ${gapMm.toFixed(1)}mm`);
  if (gapMm < 8) console.warn('  ⚠ 安全帯（8mm）を割っている。詰め方を見直す');
  await page.screenshot({ path: `${OUT}/img/flyer-kyosan.png`, clip: { x: 0, y: Math.max(0, top), width: 794, height: bottom - Math.max(0, top) } });
  await page.close();
  console.log('  img/flyer-kyosan.png');
}

// ---- ④ おでかけマップに「PR」のピン ----
{
  const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
  // 地図のインスタンスを外から触れるようにして読み込む（このときだけ。本物のファイルは変えない）
  await page.route('**/assets/bv-map.js', async (route) => {
    const res = await route.fetch();
    const js = (await res.text()).replace('var map = L.map(canvas, {', 'var map = window.__bvm = L.map(canvas, {');
    await route.fulfill({ response: res, body: js });
  });
  await page.goto(`${base}/map.html`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `
    .bvm-canvas { height: 520px !important; }
    .kyo-pin .bvm-pin { --pin: #5E5148; }
    .kyo-pin .pr { position: absolute; left: 21px; top: -9px; font: 800 11px/1 "Zen Maru Gothic", sans-serif; letter-spacing: .06em;
                   color: #fff; background: #5E5148; border: 2px solid #fff; border-radius: 999px; padding: 3px 6px; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
    .kyo-pr { display: inline-flex; align-items: center; gap: .35rem; padding-right: 1.4rem; font: 700 .76rem/1.4 "Zen Maru Gothic", sans-serif; color: #3B3530; margin-bottom: .15rem; }
    .kyo-pr b { font-weight: 800; color: #fff; background: #5E5148; border-radius: 999px; padding: .08rem .5rem; letter-spacing: .08em; }
  ` });
  await page.evaluate(() => window.__bvm.invalidateSize());
  await page.evaluate(() => {
    const L = window.L, map = window.__bvm;
    // 花小金井駅（35.7261, 139.5139）の北西の住宅地。見本で、実在のお店の位置ではない。
    // 吹き出しはピンの上に開くので、駅がピンの下に見えるように、ピンを駅の北に置く
    const at = [35.7291, 139.5106];
    map.setView(at, 15, { animate: false });
    map.panBy([0, -50], { animate: false });
    const m = L.marker(at, {
      icon: L.divIcon({ className: 'bvm-pin-wrap kyo-pin', html: '<span class="bvm-pin" aria-hidden="true"></span><span class="pr">PR</span>', iconSize: [30, 38], iconAnchor: [15, 34], popupAnchor: [0, -32] }),
      zIndexOffset: 1000,
    }).addTo(map);
    m.bindPopup('<div class="bvm-pop"><div class="bvm-pop-one">' +
      '<span class="kyo-pr"><b>PR</b>ご協賛による掲載</span>' +
      '<b class="bvm-pop-nm">〇〇こども体操クラブ</b>' +
      '<span class="bvm-pop-acc">秋の無料体験会 11/14(土) 10:00〜</span>' +
      '<span class="bvm-pop-ages">3〜6歳と保護者・予約制（11/12まで）</span>' +
      '<a class="bvm-pop-gmap" href="#">Googleマップで開く</a>' +
      '<span class="bvm-pop-links"><a href="#">🔗 公式</a></span>' +
      '</div></div>', { maxWidth: 268, closeButton: true, autoPan: false });
    m.openPopup();
  });
  await page.waitForTimeout(2500); // タイル
  const canvas = page.locator('.bvm-canvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await canvas.screenshot({ path: `${OUT}/img/map-pr.jpg`, type: 'jpeg', quality: 80 });
  await page.close();
  console.log('  img/map-pr.jpg');
}

// ---- 媒体資料に貼る小さな見本（掲載イメージのページから切り出す） ----
{
  const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await page.goto(`${base}/kyosan/demo/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // LINE: 「先取り情報」の見出しから、いちばん下の協賛の行まで
  const r = await page.evaluate(() => {
    const scr = document.querySelector('#line .screen').getBoundingClientRect();
    const a = document.querySelector('#line .hl.a').getBoundingClientRect();
    const b = document.querySelector('#line .hl.b').getBoundingClientRect();
    return { x: scr.left + window.scrollX, y: a.top + window.scrollY - 92, w: scr.width, h: b.bottom - a.top + 92 + 14 };
  });
  await page.screenshot({ path: `${OUT}/img/demo-line.png`, fullPage: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  await page.locator('#page .mark.a').screenshot({ path: `${OUT}/img/demo-card.png` });
  await page.locator('#page .mark.b').screenshot({ path: `${OUT}/img/demo-sp.png` });
  await page.close();
  console.log('  img/demo-line.png・demo-card.png・demo-sp.png');
}

// ---- 媒体資料・申込書の PDF ----
for (const [src, pdf] of [['print.html', 'bonvoya-kyosan.pdf'], ['moushikomi.html', 'moushikomi.pdf']]) {
  const page = await browser.newPage();
  await page.goto(`${base}/kyosan/${src}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: `${OUT}/${pdf}`, preferCSSPageSize: true, printBackground: true });
  await page.close();
  console.log(`  ${pdf}`);
}

await browser.close();
server.close();
