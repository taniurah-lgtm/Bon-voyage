#!/usr/bin/env node
/*
 * LINEのリッチメニュー画像（2500×843・3ボタン）を作る。
 *   node scripts/build-richmenu.mjs
 *
 * 出力: docs/homepage/assets/richmenu.png
 *
 * ★これまで画像は手作業で作られていて、作り直す手立てがリポジトリに無かった。
 *   ボタンを1つ変えるたびに作り直しになるので、生成できるようにしてある。
 *   ボタンを変えるときは下の BUTTONS だけ書き換えて、これを走らせる。
 *
 * 画像を差し替えたら、LINE Official Account Manager の
 * 「ホーム → リッチメニュー」で画像とリンク先の両方を更新すること
 * （画像だけ変えてもタップ先は変わらない）。リンク先は docs/share-kit.md の表が正。
 *
 * ⚠️ テンプレート「小」(2500×843) は最大3分割。4分割は「大」(2500×1686) にしかない。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// playwright はこのリポジトリの依存ではなく、環境に入っているものを使う。
// ESM は NODE_PATH を見ないので、見つからなければグローバルの場所から読む。
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const OUT = 'docs/homepage/assets/richmenu.png';
const W = 2500, H = 843;

// 左から順に。position は LINE 側の分割と合わせる（左・中・右）。
const BUTTONS = [
  { emoji: '📅', title: 'カレンダー',     sub: '日付から探す',       tint: '#E9F4F7' },
  { emoji: '📍', title: 'おでかけマップ', sub: '行ってよかった場所', tint: '#E9F4F7' },
  { emoji: '🏠', title: 'ホームページ',   sub: '通信のこと・お問い合わせ', tint: '#FBFAF5' },
];

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${W}px; height: ${H}px; display: grid; grid-template-columns: repeat(3, 1fr);
    font-family: "Noto Sans CJK JP", "Noto Sans JP", sans-serif;
    background: #fff; -webkit-font-smoothing: antialiased;
  }
  .b {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 26px; height: 100%; border-right: 2px solid #DCD5C6;
  }
  .b:last-child { border-right: 0; }
  .em { font-size: 190px; line-height: 1; }
  .ti { font-size: 96px; font-weight: 700; color: #2C7C9E; letter-spacing: .02em; line-height: 1; }
  .su { font-size: 52px; color: #63727B; line-height: 1; }
</style></head><body>
${BUTTONS.map((b) => `<div class="b" style="background:${b.tint}">
  <div class="em">${b.emoji}</div>
  <div class="ti">${b.title}</div>
  <div class="su">${b.sub}</div>
</div>`).join('\n')}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
mkdirSync('docs/homepage/assets', { recursive: true });
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(`wrote ${OUT} (${W}x${H})`);
console.log('  ' + BUTTONS.map((b) => b.title).join(' / '));
console.log('  ★LINE側のリンク先の更新を忘れずに（docs/share-kit.md の表）');
