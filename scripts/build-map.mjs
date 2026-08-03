#!/usr/bin/env node
/*
 * みんなのおでかけマップを生成する。
 *   node scripts/build-map.mjs
 *
 * 入力:
 *   data/map-spots.json … ぼんぼやーじゅが選んだスポット（種）。guide.html から起こしたもの。
 *   data/map-posts.json … 承認済みのみんなの投稿。scripts/map-ingest.mjs が追記する。
 * 出力:
 *   docs/homepage/map.html … 公開マップ（誰でも見られる）
 *
 * 無料 / サポーターの線引き（docs/freemium-plan.md と揃える）:
 *   - 掲載スポットは全部、誰でも見られる（無料を薄くしない）
 *   - みんなの投稿は、公開側は各スポット PUBLIC_PER_SPOT 件まで。
 *     全件と写真つきの投稿は会員ページで見られる。
 *   - 投稿の制限は「書く側」に置く: 無料=短いひとこと・写真なし / サポーター=長文・写真OK
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const POSTS = JSON.parse(readFileSync('data/map-posts.json', 'utf8'));
const OUT = 'docs/homepage/map.html';
const PUBLIC_PER_SPOT = 2;   // 公開側で1スポットあたりに出す投稿の件数
const FORM_URL = process.env.MAP_FORM_URL || '';  // 未設定ならフォームの案内は出さない

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mapQ = (name) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

// 投稿をスポット名で束ねる（表記ゆれは ingest 側で寄せる）
const bySpot = new Map();
for (const p of POSTS) {
  if (!bySpot.has(p.spot)) bySpot.set(p.spot, []);
  bySpot.get(p.spot).push(p);
}
for (const list of bySpot.values()) list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const postHTML = (p) => `<div class="voice"><div class="vtxt">${esc(p.text)}</div>` +
  `<div class="vwho">— ${esc(p.who || 'ご近所の方')}${p.date ? `・${esc(p.date)}` : ''}${p.photo ? ' <span class="vph">📷 写真つき（会員ページ）</span>' : ''}</div></div>`;

const spotHTML = (s) => {
  const all = bySpot.get(s.name) || [];
  const shown = all.slice(0, PUBLIC_PER_SPOT);
  const hidden = all.length - shown.length;
  let links = `<a class="lk map" href="${esc(s.map || mapQ(s.name))}" target="_blank" rel="noopener">📍 地図</a>`;
  if (s.official) links += `<a class="lk off" href="${esc(s.official)}" target="_blank" rel="noopener">🔗 公式</a>`;
  return `      <div class="spot" id="${esc(slug(s.name))}">
        <div class="nm">${esc(s.name)}</div>
        ${s.access ? `<div class="acc">${esc(s.access)}</div>` : ''}
        <div class="desc">${esc(s.desc)}</div>
        ${s.ages ? `<div class="ages">${esc(s.ages)}</div>` : ''}
        <div class="links">${links}</div>
        ${shown.length ? `<div class="voices">${shown.map(postHTML).join('')}${
          hidden > 0 ? `<div class="more">ほか ${hidden} 件のみんなの声は会員ページで読めます</div>` : ''
        }</div>` : ''}
      </div>`;
};

function slug(name) {
  return 's-' + Buffer.from(name).toString('hex').slice(0, 12);
}

const cats = [...new Set(SPOTS.map(s => s.cat))];
const sections = cats.map(cat => `
    <section class="cat">
      <h2>${esc(cat)}</h2>
      <div class="spots">
${SPOTS.filter(s => s.cat === cat).map(spotHTML).join('\n')}
      </div>
    </section>`).join('\n');

const totalPosts = POSTS.length;
const contribute = FORM_URL ? `
  <section class="join">
    <h2>あなたの「よかった」も置いていきませんか</h2>
    <p>行ってよかった場所、こうすると楽だったこと。ひとことで構いません。いただいた投稿は、こちらで目を通してから掲載しています（数日いただきます）。</p>
    <div class="btns">
      <a class="btn btn-warm" href="${esc(FORM_URL)}" target="_blank" rel="noopener">この地図に書き込む</a>
    </div>
    <p class="fine">どなたでも、ひとこと（40字まで）を投稿できます。<b>応援サポーターの方は、長めの文章と写真も投稿できます</b>（合言葉をフォームに入れてください）。<br>
      お子さんのお名前や顔がわかる写真、通っている園・学校がわかる内容は、掲載を控えさせていただきます。</p>
  </section>` : '';

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>みんなのおでかけマップ｜ぼんぼやーじゅ通信</title>
<meta name="description" content="花小金井まわり（小平・西東京・東久留米・立川・吉祥寺）の、子連れで行ってよかったおでかけ先を地図にまとめています。地元の家庭の声つき。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:title" content="みんなのおでかけマップ｜ぼんぼやーじゅ通信">
<meta property="og:description" content="花小金井まわりの子連れおでかけ先を、地元の家庭の声とあわせて地図に。">
<meta property="og:locale" content="ja_JP">
<style>
  :root {
    --ground:#FBFAF5; --surface:#FFFFFF; --surface-2:#F5F2EA;
    --ink:#34434C; --ink-soft:#63727B; --ink-faint:#97A2AA;
    --sky:#4FA3C4; --sky-deep:#2C7C9E; --sky-wash:#E9F4F7;
    --marigold:#EBA24A; --marigold-wash:#FBEEDA; --leaf:#74AE71;
    --line:#ECE7DB; --line-strong:#DCD5C6;
    --shadow-soft:0 2px 20px rgba(52,67,76,.05);
    --radius:20px; --radius-sm:14px;
    --maru:"Hiragino Maru Gothic ProN","ヒラギノ丸ゴ ProN W4","Yu Gothic","游ゴシック","Noto Sans JP","Segoe UI",sans-serif;
    --body:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","游ゴシック","Noto Sans JP","Segoe UI",Meiryo,sans-serif;
    --script:Georgia,"Times New Roman","Hiragino Mincho ProN",serif;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ground:#131F28; --surface:#1A2831; --surface-2:#21333D;
      --ink:#ECF2F4; --ink-soft:#AAB9C1; --ink-faint:#7B8C95;
      --sky:#6FBAD9; --sky-deep:#9AD4EA; --sky-wash:#1D3944;
      --marigold:#F0AE5E; --marigold-wash:#362F1F; --leaf:#8FC489;
      --line:#293B45; --line-strong:#38505C; --shadow-soft:0 2px 22px rgba(0,0,0,.22); }
  }
  :root[data-theme="light"]{--ground:#FBFAF5;--surface:#FFFFFF;--surface-2:#F5F2EA;--ink:#34434C;--ink-soft:#63727B;--ink-faint:#97A2AA;--sky:#4FA3C4;--sky-deep:#2C7C9E;--sky-wash:#E9F4F7;--marigold:#EBA24A;--marigold-wash:#FBEEDA;--leaf:#74AE71;--line:#ECE7DB;--line-strong:#DCD5C6;--shadow-soft:0 2px 20px rgba(52,67,76,.05);}
  :root[data-theme="dark"]{--ground:#131F28;--surface:#1A2831;--surface-2:#21333D;--ink:#ECF2F4;--ink-soft:#AAB9C1;--ink-faint:#7B8C95;--sky:#6FBAD9;--sky-deep:#9AD4EA;--sky-wash:#1D3944;--marigold:#F0AE5E;--marigold-wash:#362F1F;--leaf:#8FC489;--line:#293B45;--line-strong:#38505C;--shadow-soft:0 2px 22px rgba(0,0,0,.22);}

  * { box-sizing:border-box; }
  body { margin:0; background:var(--ground); color:var(--ink); font-family:var(--body); line-height:1.85; -webkit-font-smoothing:antialiased; font-feature-settings:"palt" 1; }
  .wrap { max-width:46rem; margin:0 auto; padding:0 1.35rem; }
  p { margin:0; }
  a { color:var(--sky-deep); }

  .ghead { background:linear-gradient(160deg, var(--sky-wash), var(--marigold-wash)); border-bottom:1px solid var(--line); }
  .ghead-in { max-width:46rem; margin:0 auto; padding:3rem 1.35rem 2.2rem; }
  .eyebrow { font-family:var(--script); font-style:italic; font-size:1.1rem; color:var(--marigold); margin-bottom:.3rem; }
  h1 { font-family:var(--maru); font-weight:800; font-size:clamp(1.7rem,5.6vw,2.4rem); letter-spacing:.02em; line-height:1.25; margin:0 0 .6rem; }
  .ghead .sub { color:var(--ink); font-size:1.02rem; max-width:32rem; }
  .count { margin-top:1rem; font-size:.88rem; color:var(--ink-soft); background:var(--surface); border:1px solid var(--line-strong); border-radius:999px; padding:.45rem .95rem; display:inline-block; }

  main { padding:2.2rem 0 1rem; }
  .cat { margin-bottom:2.2rem; }
  .cat > h2 { font-family:var(--maru); font-weight:800; font-size:1.3rem; margin:0 0 1rem; }
  .spots { display:flex; flex-direction:column; gap:.8rem; }
  .spot { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-sm); padding:1.05rem 1.15rem; box-shadow:var(--shadow-soft); }
  .spot .nm { font-family:var(--maru); font-weight:800; font-size:1.06rem; }
  .spot .acc { font-size:.85rem; color:var(--sky-deep); margin-top:.1rem; }
  .spot .desc { font-size:.95rem; color:var(--ink-soft); margin-top:.35rem; }
  .spot .ages { margin-top:.45rem; font-family:var(--maru); font-weight:700; font-size:.86rem; color:var(--ink-faint); }
  .links { margin-top:.5rem; display:flex; flex-wrap:wrap; gap:.8rem; }
  .lk { font-size:.82rem; font-weight:700; text-decoration:none; }
  .lk.map { color:var(--sky-deep); }
  .lk.off { color:var(--marigold); }
  .lk:hover { text-decoration:underline; }

  .voices { margin-top:.8rem; border-top:1px dashed var(--line-strong); padding-top:.7rem; display:flex; flex-direction:column; gap:.6rem; }
  .voice { background:var(--surface-2); border-radius:12px; padding:.6rem .8rem; }
  .vtxt { font-size:.93rem; line-height:1.7; }
  .vwho { font-size:.8rem; color:var(--ink-faint); margin-top:.2rem; }
  .vph { color:var(--marigold); font-weight:700; }
  .more { font-size:.84rem; color:var(--ink-soft); }

  .join { background:var(--surface); border:1px solid var(--line-strong); border-radius:var(--radius); padding:1.6rem 1.5rem; margin:2.4rem 0 0; box-shadow:var(--shadow-soft); }
  .join h2 { font-family:var(--maru); font-weight:800; font-size:1.2rem; margin:0 0 .6rem; }
  .join p { color:var(--ink-soft); font-size:.96rem; }
  .btns { display:flex; flex-wrap:wrap; gap:.7rem; margin:1.1rem 0 .9rem; }
  .btn { display:inline-flex; align-items:center; gap:.5rem; font-family:var(--maru); font-weight:800; font-size:1rem; padding:.8rem 1.4rem; border-radius:999px; text-decoration:none; border:1px solid transparent; }
  .btn-warm { background:var(--marigold); color:#3a2408; }
  .btn:focus-visible { outline:3px solid var(--sky); outline-offset:2px; }
  .fine { font-size:.85rem; color:var(--ink-faint); line-height:1.75; }
  .fine b { color:var(--ink-soft); }

  .back { display:inline-block; margin-top:2rem; font-family:var(--maru); font-weight:800; font-size:.95rem; text-decoration:none; }
  footer { color:var(--ink-faint); font-size:.82rem; text-align:center; padding:2.4rem 1.35rem 3rem; line-height:1.7; }
  footer .fmark { font-family:var(--maru); font-weight:800; color:var(--ink-soft); }

  @media (max-width:40rem) { html { font-size:112.5%; } .wrap,.ghead-in { padding-left:1.15rem; padding-right:1.15rem; } }
</style>
</head>
<body>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>みんなの<br>おでかけマップ</h1>
    <p class="sub">花小金井まわりで「行ってよかった」場所を、地元の家庭の声とあわせて集めています。地図リンクからそのまま案内を出せます。</p>
    <div class="count">掲載スポット ${SPOTS.length}件${totalPosts ? ` ／ みんなの声 ${totalPosts}件` : ''}</div>
  </div>
</header>

<main class="wrap">
${sections}
${contribute}
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  ※営業時間・料金・設備は変わることがあります。おでかけ前に各公式サイトでご確認ください。<br>
  <a href="tokushoho.html">特定商取引法に基づく表記・免責事項</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} — スポット${SPOTS.length}件 / 投稿${totalPosts}件${FORM_URL ? '' : '（MAP_FORM_URL 未設定のため投稿ボタンは非表示）'}`);
