#!/usr/bin/env node
/*
 * note のクリエイターページ用の画像を作る。
 *   node scripts/build-note-images.mjs
 *
 * 出力:
 *   docs/homepage/assets/note-header.png … ヘッダー 1920×1006（note の指定サイズ）
 *   docs/homepage/assets/note-icon.png   … アイコン 512×512（note では円に切り抜かれる）
 *
 * ★note はヘッダーの下にアイコンと名前を重ねて出す。文字を真ん中より少し上に置き、
 *   下側は余白にしてある（下に文字を置くと隠れる）。
 * ★アイコンは円に切り抜かれるので、四隅に意味のあるものを置かないこと。
 *
 * 素材と配色は X のヘッダー（docs/homepage/x-header.html）と揃えている。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

// ★写真は data URI で埋める。setContent したページは about:blank 扱いで、
//   file:// の画像を読み込めない（読み込めないと地の色だけの平らな絵になる）。
const HERO = 'data:image/jpeg;base64,' +
  readFileSync(resolve('docs/homepage/assets/hero-park.jpg')).toString('base64');
const SANS = '"Noto Sans CJK JP","Noto Sans JP","Noto Color Emoji",sans-serif';

const header = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:1920px; height:1006px; }
  body { font-family:${SANS}; -webkit-font-smoothing:antialiased; }
  .banner {
    width:1920px; height:1006px; position:relative; overflow:hidden;
    background-image:
      linear-gradient(90deg, rgba(44,124,158,.62) 0%, rgba(44,124,158,.42) 45%, rgba(44,124,158,.30) 100%),
      url('${HERO}');
    background-size:cover; background-position:center 52%;
  }
  /* note はヘッダーの下端にアイコンと名前を重ねる。文字は上寄せにする */
  .in { position:absolute; top:42%; left:50%; transform:translate(-50%,-50%); text-align:center; color:#fff; width:100%; padding:0 60px; }
  .eyebrow { font-size:44px; font-style:italic; letter-spacing:3px; text-shadow:0 2px 14px rgba(0,0,0,.45); }
  .brand { font-size:132px; font-weight:800; letter-spacing:4px; white-space:nowrap; margin-top:4px; text-shadow:0 3px 24px rgba(0,0,0,.5); }
  .sub { font-size:48px; margin-top:20px; letter-spacing:1px; text-shadow:0 2px 14px rgba(0,0,0,.45); }
  .tag { display:inline-block; margin-top:22px; font-size:34px; font-weight:700; background:rgba(255,255,255,.92); color:#2C7C9E; border-radius:999px; padding:10px 32px; }
  .hills { position:absolute; left:0; bottom:0; width:1920px; height:56px; }
</style></head><body><div class="banner">
  <div class="in">
    <div class="eyebrow">Bon Voyage,</div>
    <div class="brand">ぼんぼやーじゅ通信</div>
    <div class="sub">花小金井まわりの 週末おでかけ便</div>
    <div class="tag">🎈 未就学〜小学生のご家庭へ・毎週無料</div>
  </div>
  <svg class="hills" viewBox="0 0 400 12" preserveAspectRatio="none"><path d="M0,7 Q110,2 220,5 T400,4 L400,12 L0,12 Z" fill="#CFE7D0"/><path d="M0,9 Q130,5 260,7 T400,7 L400,12 L0,12 Z" fill="#A6CE8B"/></svg>
</div></body></html>`;

// アイコンは favicon.svg と同じ形。円に切り抜かれるので背景は全面。
const icon = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} html,body{width:512px;height:512px;background:#2C7C9E}
</style></head><body>
<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" fill="#2C7C9E"/>
  <path d="M32 13c8 9 12 15 12 21a12 12 0 0 1-24 0c0-6 4-12 12-21z" fill="#EBA24A"/>
  <circle cx="32" cy="35" r="5" fill="#FBFAF5"/>
</svg></body></html>`;

const browser = await chromium.launch();
mkdirSync('docs/homepage/assets', { recursive: true });

for (const [name, html, w, h] of [
  ['note-header.png', header, 1920, 1006],
  ['note-icon.png', icon, 512, 512],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/homepage/assets/${name}`, type: 'png' });
  await page.close();
  console.log(`wrote docs/homepage/assets/${name} (${w}x${h})`);
}
await browser.close();
