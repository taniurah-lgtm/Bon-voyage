#!/usr/bin/env node
/*
 * みんなのおでかけマップを生成する。
 *   MAP_POST_URL=https://script.google.com/macros/s/.../exec \
 *   MEMBER_PASS=xxx node scripts/build-map.mjs
 *
 * 入力:
 *   data/map-spots.json … ぼんぼやーじゅが選んだスポット（種）。lat/lng は
 *                         scripts/geocode-spots.mjs が入れる（取れなかったものはピンなし）
 *   data/map-posts.json … 承認済みのみんなの投稿
 * 出力:
 *   docs/homepage/map.html … 公開マップ（誰でも見られる）
 *
 * 環境変数:
 *   MAP_POST_URL … 投稿の送り先（Apps Script のウェブアプリURL）。
 *                  未設定でもフォームは出る。送信時に「まだ設定されていません」と出て、
 *                  書いた文章はコピーできる状態で残る（書いたものを捨てない）。
 *   MEMBER_PASS / INSIDER_PASS … 合言葉。フォームで「サポーターかどうか」を判定する
 *                  暗号ブロブを作るのに使う。★合言葉そのものは出力に入らない。
 *
 * 無料 / サポーターの線引き（docs/freemium-plan.md と揃える）:
 *   - 掲載スポットは全部、誰でも見られる（無料を薄くしない）
 *   - みんなの投稿は、公開側は各スポット PUBLIC_PER_SPOT 件まで。
 *     全件と写真つきは会員ページで見られる。
 *   - 投稿の制限は「書く側」に置く: 一般=短いひとこと・写真なし / サポーター=長文・写真OK
 *   - 応援のお願いは **投稿し終わったあと** にだけ出す（書く前に出さない）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { encryptFor, passphrases, ITER, jsonInTag, esc } from './lib/gate.mjs';

const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const POSTS = JSON.parse(readFileSync('data/map-posts.json', 'utf8'));
const OUT = 'docs/homepage/map.html';
const PUBLIC_PER_SPOT = 2;
const FREE_LIMIT = 40;
const PAID_LIMIT = 300;
const POST_URL = process.env.MAP_POST_URL || '';
const JOIN_URL = '/#more';   // トップページの「応援してくださる方へ」

const mapQ = (name) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

// 投稿をスポット名で束ねる
const bySpot = new Map();
for (const p of POSTS) {
  if (!bySpot.has(p.spot)) bySpot.set(p.spot, []);
  bySpot.get(p.spot).push(p);
}
for (const list of bySpot.values()) list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const postHTML = (p) =>
  `<div class="voice"><div class="vtxt">${esc(p.text)}</div>` +
  `<div class="vwho">— ${esc(p.who || 'ご近所の方')}${p.date ? `・${esc(p.date)}` : ''}${
    p.photo ? ' <span class="vph">📷 写真つき（会員ページ）</span>' : ''
  }</div></div>`;

function slug(name) {
  return 's-' + Buffer.from(name).toString('hex').slice(0, 12);
}

const spotHTML = (s) => {
  const all = bySpot.get(s.name) || [];
  const shown = all.slice(0, PUBLIC_PER_SPOT);
  const hidden = all.length - shown.length;
  let links = `<a class="lk map" href="${esc(s.map || mapQ(s.name))}" target="_blank" rel="noopener">📍 地図</a>`;
  if (s.official) links += `<a class="lk off" href="${esc(s.official)}" target="_blank" rel="noopener">🔗 公式</a>`;
  return `      <div class="spot" id="${esc(slug(s.name))}" data-cat="${esc(s.cat)}">
        <div class="nm">${esc(s.name)}${s.lat ? '' : ' <span class="nopin" title="地図上の位置が確認できていません">ピンなし</span>'}</div>
        ${s.access ? `<div class="acc">${esc(s.access)}</div>` : ''}
        <div class="desc">${esc(s.desc)}</div>
        ${s.ages ? `<div class="ages">${esc(s.ages)}</div>` : ''}
        <div class="links">${links}</div>
        ${
          shown.length
            ? `<div class="voices">${shown.map(postHTML).join('')}${
                hidden > 0 ? `<div class="more">ほか ${hidden} 件のみんなの声は会員ページで読めます</div>` : ''
              }</div>`
            : ''
        }
      </div>`;
};

const cats = [...new Set(SPOTS.map((s) => s.cat))];
const sections = cats
  .map(
    (cat) => `
    <section class="cat" data-cat="${esc(cat)}">
      <h2>${esc(cat)}</h2>
      <div class="spots">
${SPOTS.filter((s) => s.cat === cat).map(spotHTML).join('\n')}
      </div>
    </section>`
  )
  .join('\n');

// 合言葉が正しいかを判定するためのブロブ。中身は "ok" だけ。
// これがあっても合言葉は割り出せない（PBKDF2 15万回 + AES-GCM）。
const gateBlobs = [];
for (const p of passphrases()) gateBlobs.push(await encryptFor(p, 'ok'));

const totalPosts = POSTS.length;
const pinned = SPOTS.filter((s) => typeof s.lat === 'number').length;

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>みんなのおでかけマップ｜ぼんぼやーじゅ通信</title>
<meta name="description" content="花小金井まわり（小平・西東京・東久留米・立川・吉祥寺）の、子連れで行ってよかったおでかけ先を地図にまとめています。地元の家庭の声つき。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:title" content="みんなのおでかけマップ｜ぼんぼやーじゅ通信">
<meta property="og:description" content="花小金井まわりの子連れおでかけ先を、地元の家庭の声とあわせて地図に。">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/leaflet/leaflet.css">
<link rel="stylesheet" href="/assets/bv-map.css">
<link rel="stylesheet" href="/assets/bv-post.css">
<style>
  main { padding: 2rem 0 1rem; }
  .count { margin-top: 1rem; font-size: .88rem; color: var(--ink-soft); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .45rem .95rem; display: inline-block; }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }

  .mapbox { margin-bottom: 2rem; }
  .cat { margin-bottom: 2.2rem; }
  .cat[hidden] { display: none; }
  .cat > h2 { font-family: var(--maru); font-weight: 800; font-size: 1.3rem; margin: 0 0 1rem; }
  .spots { display: flex; flex-direction: column; gap: .8rem; }
  .spot { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 1.05rem 1.15rem; box-shadow: var(--shadow-soft); scroll-margin-top: 1.5rem; }
  .spot .nm { font-family: var(--maru); font-weight: 800; font-size: 1.06rem; }
  .nopin { font-family: var(--body); font-weight: 700; font-size: .68rem; color: var(--ink-faint); background: var(--surface-2); border-radius: 999px; padding: .05rem .45rem; vertical-align: .12em; }
  .spot .acc { font-size: .85rem; color: var(--sky-deep); margin-top: .1rem; }
  .spot .desc { font-size: .95rem; color: var(--ink-soft); margin-top: .35rem; }
  .spot .ages { margin-top: .45rem; font-family: var(--maru); font-weight: 700; font-size: .86rem; color: var(--ink-faint); }
  .links { margin-top: .5rem; display: flex; flex-wrap: wrap; gap: .8rem; }
  .lk { font-size: .82rem; font-weight: 700; text-decoration: none; }
  .lk.map { color: var(--sky-deep); }
  .lk.off { color: var(--marigold); }
  .lk:hover { text-decoration: underline; }

  .voices { margin-top: .8rem; border-top: 1px dashed var(--line-strong); padding-top: .7rem; display: flex; flex-direction: column; gap: .6rem; }
  .voice { background: var(--surface-2); border-radius: 12px; padding: .6rem .8rem; }
  .vtxt { font-size: .93rem; line-height: 1.7; }
  .vwho { font-size: .8rem; color: var(--ink-faint); margin-top: .2rem; }
  .vph { color: var(--marigold); font-weight: 700; }
  .more { font-size: .84rem; color: var(--ink-soft); }

  #post { margin: 2.6rem 0 0; scroll-margin-top: 1.5rem; }
</style>
</head>
<body>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>みんなの<br>おでかけマップ</h1>
    <p class="sub">花小金井まわりで「行ってよかった」場所を、地元の家庭の声とあわせて集めています。地図のピンをタップすると、そのまま経路を出せます。</p>
    <div class="count">掲載スポット ${SPOTS.length}件（地図のピン ${pinned}件）${
      totalPosts ? ` ／ みんなの声 ${totalPosts}件` : ''
    }</div>
    <div class="nav-pills">
      <a href="/">通信について</a>
      <a href="/calendar.html">おでかけカレンダー</a>
      <a href="/guide.html">おでかけガイド</a>
      <a href="#post">この地図に書き込む</a>
    </div>
  </div>
</header>

<main class="wrap">

  <div class="mapbox" id="mapbox">
    <noscript><p class="bvm-fail">地図の表示にはJavaScriptを使っています。切っている場合は、下の一覧からお探しください。各スポットの「📍 地図」から経路を出せます。</p></noscript>
  </div>

${sections}

  <section id="post"></section>

  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  ※営業時間・料金・設備は変わることがあります。おでかけ前に各公式サイトでご確認ください。<br>
  <a href="tokushoho.html">特定商取引法に基づく表記・免責事項</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script src="/assets/leaflet/leaflet.js"></script>
<script src="/assets/bv-map.js"></script>
<script src="/assets/bv-post.js"></script>
<script type="application/json" id="bv-spots">${jsonInTag(SPOTS)}</script>
<script type="application/json" id="bv-posts">${jsonInTag(POSTS)}</script>
<script type="application/json" id="bv-gate">${jsonInTag({ blobs: gateBlobs, iter: ITER })}</script>
<script>
(function(){
  var spots = JSON.parse(document.getElementById('bv-spots').textContent);
  var posts = JSON.parse(document.getElementById('bv-posts').textContent);
  var gate  = JSON.parse(document.getElementById('bv-gate').textContent);

  BVMap.mount(document.getElementById('mapbox'), {
    spots: spots,
    posts: posts,
    // 地図でしぼり込んだら、下の一覧も同じカテゴリだけにする
    onSelect: function(cat){
      document.querySelectorAll('.cat').forEach(function(sec){
        sec.hidden = !!cat && sec.dataset.cat !== cat;
      });
    }
  });

  BVPost.mount(document.getElementById('post'), {
    endpoint: ${JSON.stringify(POST_URL)},
    spots: spots,
    gate: gate,
    joinUrl: ${JSON.stringify(JOIN_URL)},
    freeLimit: ${FREE_LIMIT},
    paidLimit: ${PAID_LIMIT}
  });
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  スポット ${SPOTS.length}件（ピン ${pinned}件 / ピンなし ${SPOTS.length - pinned}件）/ 投稿 ${totalPosts}件`);
console.log(`  投稿の送り先: ${POST_URL || '未設定（フォームは出るが、送信時にコピー案内に切り替わる）'}`);
console.log(`  合言葉ブロブ: ${gateBlobs.length}件${
  passphrases()[0] === 'CHANGEME' ? '  ⚠ MEMBER_PASS 未設定のため判定は使えない' : ''
}`);
