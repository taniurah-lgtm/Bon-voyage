#!/usr/bin/env node
/*
 * バックナンバー（過去号）の公開ページを作る。
 *   node scripts/build-issues.mjs
 *
 * 入力: reports/free/YYYY-MM-DD.md（台帳と同じく rfwmo8 が正。CIで取り直す）
 * 出力: docs/homepage/issues.html
 *
 * ★2026-09-04: 過去号は合言葉つきのページにしか置いていなかった。
 *   月額制度の廃止にともない、公開側へ移した（`docs/strategy-2026-09.md`）。
 *   検索から入ってくる入口としても効くので、noindex にはしない。
 */
import { writeFileSync } from 'node:fs';
import { esc } from './lib/gate.mjs';
import { readIssues, issuesHTML } from './lib/issues.mjs';

const OUT = 'docs/homepage/issues.html';
const issues = readIssues();
const newest = issues[0];

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>バックナンバー｜ぼんぼやーじゅ通信</title>
<meta name="description" content="ぼんぼやーじゅ通信のこれまでの号。花小金井・小平まわりの週末おでかけ情報を、毎週水曜にお届けしています。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/issues.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/issues.html">
<meta property="og:title" content="バックナンバー｜ぼんぼやーじゅ通信">
<meta property="og:description" content="これまでにお届けした号を、そのまま読めます。">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  main { padding: 1.4rem 0 1rem; }
  .lead { color: var(--ink-soft); font-size: .9rem; line-height: 1.8; margin-bottom: 1.3rem; }
  .issue { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); margin-bottom: .5rem; }
  .issue > summary { font-family: var(--maru); font-weight: 800; font-size: .96rem; color: var(--sky-deep); cursor: pointer; padding: .85rem 1.05rem; list-style: none; min-height: 44px; display: flex; align-items: center; }
  .issue > summary::marker, .issue > summary::-webkit-details-marker { display: none; }
  .issue > summary::before { content: "＋ "; }
  .issue[open] > summary::before { content: "− "; }
  .issue-fix { background: var(--marigold-wash); border: 1px solid var(--marigold); border-radius: 10px; padding: .6rem .8rem; margin: 0 0 .8rem; font-size: .85rem; line-height: 1.8; white-space: normal; }
  .issue-hasfix { margin-left: .5rem; font-weight: 700; font-size: .7rem; color: var(--marigold-ink); background: var(--marigold-wash); border-radius: 999px; padding: .05rem .5rem; }
  .issue-body { margin: 0; padding: 0 1.05rem 1.05rem; font-size: .9rem; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink-soft); }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.8rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }
  .stamp { font-size: .8rem; color: var(--ink-faint); margin-top: 2rem; }
</style>
</head>
<body>
<nav class="bvnav" aria-label="サイト内">
  <div class="bvnav-in">
    <a class="bvnav-brand" href="/">ぼんぼやーじゅ通信</a>
    <div class="bvnav-links">
      <a href="/" class="bv-hide-sm">通信について</a>
      <a href="/calendar.html"><span class="bv-lg">おでかけ</span>カレンダー</a>
      <a href="/map.html"><span class="bv-lg">おでかけ</span>マップ</a>
      <a class="bvnav-cta" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>バックナンバー</h1>
    <p class="sub">これまでにお届けした号を、そのまま読めます。</p>
  </div>
</header>

<main class="wrap">
  <p class="lead">毎週水曜の朝にお届けしている「ぼんぼやーじゅ通信」の過去号です（全${issues.length}号）。
    号は<b>お届けした日のまま</b>置いています。あとから取り下げた記載には、上に📝で訂正を添えました。<br>
    日程・料金は変わることがあります。おでかけの前に各公式でご確認ください。</p>

${issuesHTML(issues) || '  <p class="lead">まだ号がありません。</p>'}

  <p class="stamp">${newest ? `いちばん新しい号: ${esc(String(newest.y))}年${newest.m}月${newest.d}日(${newest.wd})` : ''}</p>

  <div class="nav-pills">
    <a href="/">通信について</a>
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/guide.html">子連れおでかけガイド</a>
    <a href="/#contact">お問い合わせ</a>
  </div>

  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  過去号 ${issues.length}号（訂正つき ${issues.filter((i) => i.fixes.length).length}号）`);
