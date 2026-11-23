#!/usr/bin/env node
/*
 * 習い事ガイド（2026-11-23 オーナー決定・docs/sponsor-plan.md §16）を data/lessons.json から組む。
 *
 *   node scripts/build-lessons.mjs                 … launch が true のときだけ docs/homepage/lessons.html を書く（確かめた教室だけ）
 *   node scripts/build-lessons.mjs --preview <出力> … 確認用。確認中の教室（「確認中」の札）と、営業の見本のPRカード（「見本」の札）も入れる
 *
 * 決まり（§16）:
 *   - 市・公民館・体育館の教室は無料で載せる（kind: public）。掲載料をいただいた教室は kind: pr → カードの頭に「PR」
 *   - 並びはジャンルごとに五十音（yomi）。払った額・時期で順番を変えない
 *   - 書くのは公式か、教室からいただいた事実だけ。「おすすめ」「No.1」など比べる言葉は書かない（止める）
 *   - LINE本文には載せない・リンクもしない（このページはホームページの中だけ）
 */
import { navSub } from './lib/nav.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/lessons.json';
const OUT = 'docs/homepage/lessons.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const LINE_URL = 'https://lin.ee/YtcfjnX';

const args = process.argv.slice(2);
const pi = args.indexOf('--preview');
const PREVIEW = pi >= 0 ? args[pi + 1] : null;
if (pi >= 0 && !PREVIEW) { console.error('--preview のあとに出力先を書いてください'); process.exit(1); }

const data = JSON.parse(readFileSync(SRC, 'utf8'));
if (!PREVIEW && data.launch !== true) {
  console.log('習い事ガイド: まだ公開しない（data/lessons.json の launch が true になっていない）。確認用は --preview <出力先>');
  process.exit(0);
}

const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部|Muse|スクショ/;
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;
const PRAISE = /おすすめ|オススメ|No\.?\s?1|ナンバーワン|いちばん人気|一番人気|必ず上達|地域一番|最高の/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const fmtDay = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;

const problems = [];
const GENRES = data.genres || [];
const AGES = data.ages || {};
const PLACES = data.places || {};

let list = (data.lessons || []).slice();
if (PREVIEW && data.sample) list.push(data.sample);
const skipped = list.filter((l) => l.verified !== true);
if (!PREVIEW) list = list.filter((l) => l.verified === true);

for (const l of list) {
  const nm = l.name || l.id;
  for (const f of ['id', 'name', 'yomi', 'genre', 'who', 'when', 'cost', 'book']) if (!l[f]) problems.push(`${nm}: ${f} が無い`);
  if (!GENRES.some((g) => g.key === l.genre)) problems.push(`${nm}: ジャンル「${l.genre}」は genres に無い`);
  if (!(l.ages || []).length || l.ages.some((a) => !AGES[a])) problems.push(`${nm}: ages（${Object.keys(AGES).join('/')}）が無いか、違う`);
  if (!['public', 'pr'].includes(l.kind)) problems.push(`${nm}: kind は public か pr`);
  if (l.kind === 'pr' && !l.pr) problems.push(`${nm}: PR の教室は pr（教室の名前）を書く`);
  if (l.kind === 'public' && l.pr) problems.push(`${nm}: 無料の教室に pr が付いている`);
  if (l.place && !PLACES[l.place]) problems.push(`${nm}: place「${l.place}」は places に無い`);
  if (!l.place && !(l.where && l.url)) problems.push(`${nm}: 場所（where）と公式（url）が無い`);
  if (!PREVIEW && !l.checked) problems.push(`${nm}: checked（公式を確かめた日）が無い`);
  const shown = [l.name, l.who, l.when, l.cost, l.trial, l.book, l.where, ...(l.notes || [])].filter(Boolean).join(' ');
  if (PRAISE.test(shown)) problems.push(`${nm}: 比べる言葉・評価の言葉が入っている（${shown.match(PRAISE)[0]}）`);
}
if (problems.length) { for (const p of problems) console.error('🔴 ' + p); process.exit(1); }

const placeOf = (l) => (l.place ? PLACES[l.place] : null);
const ageChips = (l) => l.ages.map((a) => `<span class="ag ag-${a}">${esc(AGES[a])}</span>`).join('');

function card(l) {
  const p = placeOf(l);
  const where = l.where || (p && `${p.name}（${p.where}）`);
  const url = l.url || (p && p.url);
  const mq = l.mapq || (p && p.mapq) || l.name;
  const org = l.kind === 'pr' ? '' : (p ? p.name : (l.org || ''));
  const badge = l.sample ? '<span class="flag">見本</span>' : (l.verified !== true ? '<span class="flag">確認中</span>' : '');
  const src = l.kind === 'pr'
    ? `教室からいただいた内容です${l.checked ? `（${fmtDay(l.checked)}）` : ''}。`
    : (l.checked ? `${fmtDay(l.checked)}に、${esc(p ? p.src : '公式の案内')}で確かめました。` : '公式の案内で確かめているところです。');
  const kv = (k, v) => (v ? `<div class="kv"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : '');
  return `<details class="ls" id="${esc(l.id)}" data-ages="${esc(l.ages.join(' '))}">
      <summary class="ls-h">
        <span class="ls-n">${l.kind === 'pr' ? `<span class="pr">PR</span><span class="pr-by">${esc(l.pr)}のご協賛で掲載</span>` : ''}<h3>${esc(l.name)}${badge}</h3>${org ? `<span class="org">${esc(org)}</span>` : ''}<span class="ags">${ageChips(l)}</span></span>
        <span class="chev" aria-hidden="true"></span>
      </summary>
      <div class="ls-b">
        <div class="kvs">
          ${kv('対象', l.who)}
          ${kv('曜日', l.when)}
          ${kv('費用', l.cost)}
          ${kv('体験', l.trial)}
          ${kv('場所', where)}
          ${kv('申込', l.book)}
        </div>
        ${(l.notes || []).length ? `<ul class="nt">${l.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <div class="ls-f">
          <span class="chk">${src}</span>
          <span class="acts">
            ${url ? `<a class="lk" href="${esc(url)}" target="_blank" rel="noopener" data-goatcounter-click="${esc('習い事公式｜' + l.name)}">${l.kind === 'pr' ? '教室のページ' : '公式'}</a>` : ''}
            <a class="lk" href="${esc(mapUrl(mq))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('習い事地図｜' + l.name)}">地図</a>
          </span>
        </div>
      </div>
    </details>`;
}

const byGenre = GENRES.map((g) => ({ g, items: list.filter((l) => l.genre === g.key).sort((a, b) => a.yomi.localeCompare(b.yomi, 'ja')) })).filter((x) => x.items.length);
const n = list.length;
const title = '習い事ガイド（小平の子どもの習い事）';
const desc = '小平の子育て家庭が、年齢とジャンルで習い事を探せるページ。市の体育館・公民館などの教室と、掲載料をいただいた教室（PR）を、公式の案内に書いてあることで並べています。';

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/lessons.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/lessons.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="ja_JP">
${PREVIEW ? '<meta name="robots" content="noindex,nofollow">\n' : ''}<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  :root { --dot:#C98A3A; --pr-bg:#FBEFD9; --pr-ink:#8A5A12; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --dot:#F0AE5E; --pr-bg:#3A2E1C; --pr-ink:#F0C27A; } }
  :root[data-theme="dark"] { --dot:#F0AE5E; --pr-bg:#3A2E1C; --pr-ink:#F0C27A; }
  main { padding: 1.2rem 0 1rem; }
  .ghead-in { padding-top: 1.4rem; padding-bottom: 1.2rem; }
  .ghead h1 { font-size: clamp(1.45rem, 4.8vw, 2rem); margin-bottom: .35rem; }
  .ghead .sub { font-size: .92rem; line-height: 1.75; }
  .notice { font-size: .82rem; color: var(--ink-soft); line-height: 1.75; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .7rem .9rem; margin-bottom: 1rem; }
  .notice b { color: var(--ink); }
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.6rem 0 .6rem; scroll-margin-top: 96px; }
  .filt { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 .5rem; }
  .filt button, .jump a { font: inherit; display: inline-flex; align-items: center; gap: .3rem; font-size: .78rem; font-weight: 700; min-height: 36px; padding: 0 .75rem; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; text-decoration: none; }
  .filt button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }
  .filt button:focus-visible, .jump a:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }
  .jump { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 .6rem; }
  .jump small { font-size: .7rem; color: var(--ink-faint); }
  .filt-none { font-size: .86rem; color: var(--ink-soft); margin: .4rem 0; }
  .ls { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); margin-bottom: .6rem; scroll-margin-top: 96px; }
  .ls-h { display: flex; align-items: center; gap: .6rem; padding: .85rem 1.05rem; cursor: pointer; list-style: none; border-radius: var(--radius-sm); }
  .ls-h::-webkit-details-marker { display: none; }
  .ls-h:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }
  .ls-n { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
  .ls h3 { font-family: var(--maru); font-weight: 800; font-size: 1.02rem; margin: 0; line-height: 1.45; }
  .org { font-size: .78rem; color: var(--ink-faint); }
  .pr { align-self: flex-start; font-size: .82rem; font-weight: 800; letter-spacing: .06em; color: var(--pr-ink); background: var(--pr-bg); border-radius: 6px; padding: .05rem .5rem; }
  .pr-by { font-size: .78rem; color: var(--pr-ink); }
  .flag { display: inline-block; margin-left: .4rem; font-size: .68rem; font-weight: 700; color: var(--ink-soft); border: 1px dashed var(--ink-faint); border-radius: 6px; padding: 0 .35rem; vertical-align: 2px; }
  .ags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .3rem; }
  .ag { font-size: .72rem; font-weight: 700; border-radius: 999px; padding: .05rem .55rem; background: var(--marigold-wash); color: var(--marigold-ink); }
  .chev { flex: none; width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--line-strong); position: relative; }
  .chev::before { content: ""; position: absolute; left: 50%; top: 45%; width: 8px; height: 8px; border-right: 2px solid var(--ink-soft); border-bottom: 2px solid var(--ink-soft); transform: translate(-50%, -50%) rotate(45deg); transition: transform .15s; }
  .ls[open] .chev::before { transform: translate(-50%, -25%) rotate(-135deg); }
  .ls[open] .ls-h { border-bottom: 1px solid var(--line); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  @media (prefers-reduced-motion: reduce) { .chev::before { transition: none; } }
  .ls-b { padding: .8rem 1.05rem; }
  .kvs { display: grid; gap: .15rem; margin-bottom: .55rem; }
  .kv { display: flex; gap: .6rem; font-size: .84rem; line-height: 1.6; }
  .kv .k { flex: none; width: 2.6em; color: var(--ink-faint); font-size: .78rem; padding-top: .08rem; }
  .kv .v { min-width: 0; }
  .nt { list-style: none; margin: 0 0 .4rem; padding: 0; display: grid; gap: .2rem; }
  .nt li { position: relative; padding-left: 1rem; font-size: .86rem; line-height: 1.65; }
  .nt li::before { content: ""; position: absolute; left: .15rem; top: .62em; width: 6px; height: 6px; border-radius: 999px; background: var(--dot); }
  .ls-f { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .6rem; margin-top: .6rem; padding-top: .5rem; border-top: 1px solid var(--line); }
  .chk { font-size: .72rem; color: var(--ink-faint); line-height: 1.6; }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .75rem; background: var(--surface); white-space: nowrap; }
  .ask { margin-top: 1.4rem; padding: .85rem 1rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: .84rem; line-height: 1.8; color: var(--ink-soft); }
  .ask b { display: block; font-family: var(--maru); font-weight: 800; color: var(--ink); font-size: .95rem; margin-bottom: .2rem; }
  .about { font-size: .82rem; color: var(--ink-soft); line-height: 1.8; margin-top: 1.2rem; }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.6rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<nav class="bvnav" aria-label="サイト内">
  <div class="bvnav-in">
    <a class="bvnav-brand" href="/">ぼんぼやーじゅ通信</a>
    <div class="bvnav-links">
      <a href="/" class="bv-hide-sm">通信について</a>
      <a class="bvnav-cta" href="${LINE_URL}" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
${navSub('lessons')}
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>習い事ガイド</h1>
    <p class="sub">小平の子どもの習い事を、年齢とジャンルで探せます。市の体育館や公民館の教室と、地域の教室を、それぞれの公式の案内に書いてあることで並べています。</p>
  </div>
</header>

<main class="wrap">
  <p class="notice"><b>「PR」とある教室は、教室から掲載料をいただいて載せています。</b>市の体育館・公民館などの教室は、無料で載せています。並びはジャンルごとの五十音順で、掲載料で順番は変えていません。</p>

  <div class="filt" role="group" aria-label="年齢でしぼる">
    <button type="button" data-f="all" aria-pressed="true">すべての年齢</button>
    ${Object.entries(AGES).filter(([k]) => list.some((l) => l.ages.includes(k))).map(([k, v]) => `<button type="button" data-f="${k}" aria-pressed="false">${esc(v)}</button>`).join('\n    ')}
  </div>
  <nav class="jump" aria-label="ジャンル">
    ${byGenre.map(({ g, items }) => `<a href="#g-${g.key}">${esc(g.label)}<small>${items.length}</small></a>`).join('\n    ')}
  </nav>
  <p class="filt-none" id="filt-none" hidden>この年齢の教室は、まだ載っていません。</p>

  ${byGenre.map(({ g, items }) => `<section class="gs" data-genre="${g.key}">
  <h2 class="sec" id="g-${g.key}">${esc(g.label)}</h2>
  ${items.map(card).join('\n  ')}
  </section>`).join('\n  ')}

  <div class="ask">
    <b>教室を載せたい方へ</b>
    習い事の教室のカードは、最初の3か月は無料、そのあと年5,000円です。3か月たったら、教室のページへのクリック数をお見せして、続けるかどうかをお聞きします。自動で請求はしません。<a href="/#contact">お問い合わせ</a>からご連絡ください。
  </div>

  <p class="about">費用や曜日は変わることがあります。申し込む前に、それぞれの公式の案内でご確認ください。<br>
  内容の誤りに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
    <a href="/entei.html">こだいら幼稚園だより</a>
    <a href="/cafe.html">子連れで入りやすいカフェ</a>
  </div>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script>
/* 年齢でしぼる: 合わない教室を隠し、空になったジャンルの見出しも隠す */
(function () {
  var btns = [].slice.call(document.querySelectorAll('.filt button'));
  var cards = [].slice.call(document.querySelectorAll('details.ls'));
  var secs = [].slice.call(document.querySelectorAll('.gs'));
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-f'), n = 0;
      btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      cards.forEach(function (c) { var on = f === 'all' || (' ' + c.getAttribute('data-ages') + ' ').indexOf(' ' + f + ' ') >= 0; c.hidden = !on; if (on) n++; });
      secs.forEach(function (s) { s.hidden = !s.querySelector('details.ls:not([hidden])'); });
      document.getElementById('filt-none').hidden = n > 0;
    });
  });
  function openTo(id) { var el = id && document.getElementById(id); if (el && el.tagName === 'DETAILS') el.open = true; }
  window.addEventListener('hashchange', function () { openTo(decodeURIComponent(location.hash.slice(1))); });
  openTo(decodeURIComponent(location.hash.slice(1)));
})();
</script>
</body>
</html>
`;

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const leak = visible.match(LEAK);
if (leak) { console.error(`🔴 公開ページに出せない言葉が入りました: ${leak[0]}`); process.exit(1); }
if (CONTACT.test(visible.replace(/https?:\/\/\S+/g, ''))) { console.error('🔴 個人の連絡先（携帯・メール）らしきものがある'); process.exit(1); }

const out = PREVIEW || OUT;
writeFileSync(out, html);
console.log(`wrote ${out}（${n}件 / ${byGenre.map(({ g, items }) => `${g.label}${items.length}`).join('・')}）`);
if (skipped.length) console.log(`  ${PREVIEW ? '確認中で入れたもの' : '確認中で外したもの'}: ${skipped.map((l) => l.name).join('・')}`);
