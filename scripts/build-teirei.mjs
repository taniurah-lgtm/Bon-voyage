#!/usr/bin/env node
/*
 * 児童館・図書館・子育てひろばの「定例」のページを組む。
 *   node scripts/build-teirei.mjs
 *
 *   data/teirei.json → docs/homepage/teirei.html
 *
 * 2026-10-06 オーナー依頼（カテゴリ別のまとめページの2つめ。1つめは園庭開放 build-entei.mjs）。
 * 毎月くり返す会（図書館のおはなし会・絵本のへや、児童館のこども広場、子育てひろば、出張ひろば）を
 * 施設ごとにまとめ、上に「これから2週間」を日付ごとに出す。
 *
 * ★書くのは公式（図書館の行事ページ・年間予定表、児童館だより、子ども家庭支援センターだより）で確かめた事実だけ。
 *   書いていないことは null のままにし、推測で埋めない。
 * ★過ぎた日は、ページを開いた日に合わせてブラウザ側で隠す。
 * ★確かめた日（checked）から45日を過ぎた施設と、これからの日が無い会は、組むたびに🔴で知らせる。
 *   児童館・子育てひろばは月ごとのおたよりなので、毎月の第1水曜の巡回で取り直す（docs/sources.md）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/teirei.json';
const OUT = 'docs/homepage/teirei.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const STALE_DAYS = 45;
const SHOW_CHIPS = 6; // 日付は先の6回まで見せ、残りは「もっと見る」

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 🔒 公開ページに内部の話を出さない（仕組み・ファイル名・判定理由）
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部/;
// 🔒 個人の連絡先を撒かない（携帯・メール）
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dow = (iso) => WD[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const label = (iso) => `${md(iso)}(${dow(iso)})`;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const short = (name) => name.replace(/（.*?）/g, '');
const shortOf = (p) => p.short || short(p.name);
const asItem = (x) => (typeof x === 'string' ? { d: x } : x);
const AGE_LABEL = { baby: '👶 0〜3歳', kids: '🧒🎒 4歳〜小学生', all: 'だれでも' };

// ── 検査 ──────────────────────────────────────────────
const problems = [];
const warn = [];
const places = data.sections.flatMap((s) => s.places);
for (const p of places) {
  if (!p.checked) problems.push(`${p.name}: checked（確かめた日）が無い`);
  else if (daysBetween(p.checked, todayJST) > STALE_DAYS) warn.push(`${p.name}: 確かめてから ${daysBetween(p.checked, todayJST)} 日。公式を見直す`);
  for (const g of p.programs) {
    if (!AGE_LABEL[g.age]) problems.push(`${p.name}「${g.title}」: age は baby / kids / all のどれか`);
    for (const x of g.dates || []) {
      const d = asItem(x).d;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) problems.push(`${p.name}「${g.title}」: 日付の形がおかしい ${d}`);
    }
    const upcoming = (g.dates || []).map((x) => asItem(x).d).filter((d) => d >= todayJST);
    if (!g.when && !upcoming.length && !g.more) warn.push(`${p.name}「${g.title}」: これからの日が無い。公式で次を探すか、more に書く`);
  }
}
const { _about, ...pub } = data;
const allText = JSON.stringify(pub);
for (const m of allText.matchAll(new RegExp(LEAK, 'g'))) problems.push(`🔒 公開に出せない言葉: ${m[0]}`);
if (CONTACT.test(allText)) problems.push('🔒 個人の連絡先（携帯・メール）らしきものがある');
if (problems.length) {
  console.error('🔴 組めません:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ── 部品 ──────────────────────────────────────────────
const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapq || short(p.name))}`;
const fmtChecked = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const row = (k, v) => (v ? `<div class="kv"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : '');

function dateChips(g) {
  const items = (g.dates || []).map(asItem).filter((x) => x.d >= todayJST);
  if (!items.length) return '';
  const many = items.length > SHOW_CHIPS;
  return `<ul class="dates${items.some((x) => (x.t || '').length > 12) ? ' long' : ''}">${items
    .map((x) => `<li data-d="${x.d}"><b>${label(x.d)}</b>${x.t ? `<span>${esc(x.t)}</span>` : ''}</li>`)
    .join('')}</ul>${many ? '<button type="button" class="morebtn" hidden>ほかの日も見る</button>' : ''}`;
}

function program(g, p) {
  const tag = g.open === true
    ? '<span class="tag ok">予約なし</span>'
    : g.open === false ? '<span class="tag bk">申込み・登録</span>' : '';
  const src = g.src && g.src !== p.url ? `<a class="src" href="${esc(g.src)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜${esc(g.title)}">この会の案内（公式）</a>` : '';
  return `<div class="prog" data-age="${g.age}">
        <h3>${esc(g.title)} <span class="agetag">${AGE_LABEL[g.age]}</span> ${tag}</h3>
        ${g.when ? `<p class="when">${esc(g.when)}</p>` : ''}
        ${dateChips(g)}
        ${g.more ? `<p class="more">${esc(g.more)}</p>` : ''}
        ${!g.when ? `<p class="more done" hidden>ここに出ている日は終わりました。次の日程は公式で。</p>` : ''}
        <div class="kvs">
          ${row('時間', g.time)}
          ${row('場所', g.place)}
          ${row('対象', g.who)}
          ${row('定員', g.cap)}
          ${row('費用', g.cost)}
          ${row('予約', g.book ?? '公式に予約の案内はありません')}
        </div>
        ${(g.notes || []).length ? `<ul class="notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${src}
      </div>`;
}

function place(p) {
  const ages = [...new Set(p.programs.map((g) => g.age))].join(' ');
  return `<article class="pl" id="${p.key}" data-ages="${ages || 'all'}">
      <div class="pl-h"><h2>${esc(p.name)}</h2>${p.town ? `<p class="town">${esc(p.town)}</p>` : ''}</div>
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      ${p.note ? `<p class="more">${esc(p.note)}</p>` : ''}
      ${p.programs.map((g) => program(g, p)).join('\n      ')}
      ${p.footnote ? `<p class="fn">${esc(p.footnote)}</p>` : ''}
      <div class="pl-f">
        <span class="chk">${fmtChecked(p.checked)}に、公式で確かめました</span>
        <span class="acts">
          <a class="lk" href="${esc(p.url)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜公式">公式</a>
          <a class="lk" href="${mapUrl(p)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜地図">地図</a>
        </span>
      </div>
    </article>`;
}

// 「これから2週間」：予約なしで行ける・日付のあるもの（申込みのいるものは除く）
const soon = [];
for (const p of places) {
  for (const g of p.programs) {
    if (g.open !== true) continue;
    for (const x of (g.dates || []).map(asItem)) {
      if (x.d < todayJST) continue;
      const tm = (g.timeByDow && g.timeByDow[dow(x.d)]) || g.time || '';
      soon.push({ d: x.d, key: p.key, pl: shortOf(p), t: x.t || g.title, time: x.t ? '' : tm, age: g.age });
    }
  }
}
soon.sort((a, b) => a.d.localeCompare(b.d) || a.pl.localeCompare(b.pl, 'ja'));
const byDate = new Map();
for (const s of soon) byDate.set(s.d, [...(byDate.get(s.d) || []), s]);
const soonHtml = [...byDate]
  .map(([d, xs]) => `<li class="day" data-d="${d}"><span class="sd">${label(d)}</span><ul>${xs
    .map((x) => `<li data-age="${x.age}"><a href="#${x.key}">${esc(x.pl)}</a> ${esc(x.t)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</li>`)
    .join('')}</ul></li>`)
  .join('\n        ');

const regular = [];
for (const p of places) for (const g of p.programs) if (g.open === true && g.when) regular.push({ key: p.key, pl: shortOf(p), t: g.title, when: g.when, age: g.age });
const regularHtml = regular
  .map((x) => `<li data-age="${x.age}"><a href="#${x.key}">${esc(x.pl)}</a> ${esc(x.t)}<small>${esc(x.when)}</small></li>`)
  .join('\n        ');

const title = '児童館・図書館・子育てひろばの定例（小平）';
const desc = '小平市の図書館のおはなし会・絵本のへや、児童館のこども広場、子育てひろば、地域センターの出張ひろば。毎月くり返す会の日程を、公式の案内で確かめてまとめています。';

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/teirei.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/teirei.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  main { padding: 1.2rem 0 1rem; }
  .ghead-in { padding-top: 1.4rem; padding-bottom: 1.2rem; }
  .ghead h1 { font-size: clamp(1.45rem, 4.8vw, 2rem); margin-bottom: .35rem; }
  .ghead .sub { font-size: .92rem; line-height: 1.75; }
  .lead { color: var(--ink-soft); font-size: .86rem; line-height: 1.75; margin-bottom: 1rem; }
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.8rem 0 .4rem; }
  .sec-lead { color: var(--ink-soft); font-size: .84rem; line-height: 1.7; margin-bottom: .8rem; }

  /* 年齢でしぼる */
  .agef { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0 0 .9rem; }
  .agef button { font-family: var(--maru); font-weight: 700; font-size: .8rem; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); border-radius: 999px; padding: .4rem .85rem; min-height: 36px; cursor: pointer; }
  .agef button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }

  /* これから2週間 */
  .soon { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: .9rem 1rem; }
  .soon h3 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0 0 .45rem; color: var(--sky-deep); }
  .soon > ul { list-style: none; margin: 0 0 .9rem; padding: 0; }
  .soon .day { display: grid; grid-template-columns: 4.7em 1fr; gap: .6rem; padding: .45rem 0; border-top: 1px dashed var(--line); }
  .soon .day:first-child { border-top: 0; }
  .soon .sd { font-family: var(--maru); font-weight: 800; font-size: .88rem; }
  .soon .day ul, .soon .reg { list-style: none; margin: 0; padding: 0; }
  .soon .day li, .soon .reg li { font-size: .84rem; line-height: 1.55; padding: .1rem 0; }
  .soon .reg li { padding: .35rem 0; border-top: 1px dashed var(--line); }
  .soon .reg li:first-child { border-top: 0; }
  .soon a { font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .soon small { display: block; color: var(--ink-faint); font-size: .74rem; }
  .soon .empty, .soon .wk { color: var(--ink-faint); font-size: .78rem; }

  /* 目次 */
  .idx { display: flex; flex-wrap: wrap; gap: .35rem; margin: 1rem 0 0; }
  .idx a { font-size: .8rem; font-weight: 700; text-decoration: none; color: var(--link-ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .3rem .75rem; }

  /* 施設ごと */
  .pl { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: 1rem 1.05rem .8rem; margin-bottom: .9rem; scroll-margin-top: 64px; }
  .pl-h { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .pl h2 { font-family: var(--maru); font-weight: 800; font-size: 1.04rem; margin: 0; line-height: 1.4; }
  .town { font-size: .78rem; color: var(--ink-faint); }
  .intro { font-size: .84rem; color: var(--ink-soft); margin-top: .35rem; line-height: 1.7; }
  .prog { margin-top: .8rem; padding-top: .7rem; border-top: 1px solid var(--line); }
  .pl > .prog:first-of-type { border-top: 0; padding-top: 0; }
  .prog h3 { font-family: var(--maru); font-weight: 800; font-size: .94rem; margin: 0 0 .35rem; line-height: 1.5; }
  .tag, .agetag { display: inline-block; font-size: .64rem; font-weight: 700; border-radius: 999px; padding: .05rem .5rem; vertical-align: .12em; margin-left: .15rem; white-space: nowrap; }
  .agetag { background: var(--surface-2); color: var(--ink-soft); }
  .tag.ok { background: var(--sky-wash); color: var(--sky-deep); }
  .tag.bk { background: var(--marigold-wash); color: var(--marigold-ink); }
  .when { font-size: .88rem; font-weight: 700; margin-bottom: .3rem; }
  .dates { list-style: none; margin: 0 0 .45rem; padding: 0; display: flex; flex-wrap: wrap; gap: .3rem; }
  .dates.long { flex-direction: column; }
  .dates li { font-size: .8rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: .1rem .45rem; line-height: 1.6; }
  .dates li b { font-family: var(--maru); }
  .dates li span { margin-left: .35rem; color: var(--ink-soft); }
  .morebtn { font-size: .76rem; font-weight: 700; color: var(--link-ink); background: none; border: 0; padding: .2rem 0 .5rem; cursor: pointer; min-height: 32px; }
  .more { font-size: .82rem; color: var(--ink-soft); background: var(--surface-2); border-radius: 8px; padding: .35rem .6rem; margin: .4rem 0 .45rem; line-height: 1.65; }
  .kvs { display: grid; gap: .12rem; }
  .kv { display: flex; gap: .6rem; font-size: .84rem; line-height: 1.6; }
  .kv .k { flex: none; width: 3.6em; color: var(--ink-faint); font-size: .78rem; padding-top: .08rem; }
  .notes { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .8rem; color: var(--ink-soft); line-height: 1.65; }
  .src { display: inline-flex; align-items: center; min-height: 32px; font-size: .76rem; font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .fn { font-size: .78rem; color: var(--ink-faint); margin-top: .6rem; line-height: 1.6; }
  .pl-f { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .6rem; margin-top: .7rem; padding-top: .5rem; border-top: 1px solid var(--line); }
  .chk { font-size: .72rem; color: var(--ink-faint); }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .85rem; background: var(--surface); white-space: nowrap; }

  .tips { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .9rem 1.1rem; }
  .tips ul { margin: 0; padding-left: 1.1rem; font-size: .86rem; line-height: 1.75; }
  .tips li + li { margin-top: .25rem; }
  .about { font-size: .82rem; color: var(--ink-soft); line-height: 1.8; margin-top: 1.4rem; }
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
      <a class="bvnav-cal" href="/calendar.html">📅<span class="bv-lg">おでかけ</span>カレンダー</a>
      <a href="/map.html"><span class="bv-lg">おでかけ</span>マップ</a>
      <a class="bvnav-cta" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>児童館・図書館・<br>子育てひろばの定例</h1>
    <p class="sub">毎月くり返す、無料の会。図書館のおはなし会と絵本のへや、児童館のこども広場、子育てひろば、地域センターへの出張ひろばを、小平市内ぶんまとめました。</p>
  </div>
</header>

<main class="wrap">
  <p class="lead">日程は、図書館・児童館・子ども家庭支援センターの公式の案内で確かめています。行事や天候で変わることがあるので、<b>出かける前に各施設の案内で</b>確かめてください。</p>

  <div class="agef" role="group" aria-label="年齢でしぼる">
    <button type="button" data-f="" aria-pressed="true">すべて</button>
    <button type="button" data-f="baby" aria-pressed="false">👶 0〜3歳</button>
    <button type="button" data-f="kids" aria-pressed="false">🧒🎒 4歳〜小学生</button>
  </div>

  <section class="soon" aria-labelledby="soon-h">
    <h3 id="soon-h">これから2週間の、予約なしで行ける日</h3>
    <ul id="soon">
        ${soonHtml}
    </ul>
    <p class="empty" id="soon-empty" hidden>この2週間に、この年齢向けの日付つきの会は見つかっていません。下の「決まった曜日」をご覧ください。</p>
    <h3>決まった曜日・時間にひらいているもの</h3>
    <ul class="reg">
        ${regularHtml}
    </ul>
    <p class="wk">休館日や行事の日は、お休みになることがあります。</p>
  </section>

  <nav class="idx" aria-label="施設の一覧">
    ${data.sections.map((s) => `<a href="#sec-${s.key}">${esc(s.title.replace(/の「.*$/, ''))}</a>`).join('\n    ')}
  </nav>

  ${data.sections
    .map((s) => `<h2 class="sec" id="sec-${s.key}">${esc(s.title)}</h2>
  <p class="sec-lead">${esc(s.lead)}</p>
  ${s.places.map(place).join('\n  ')}`)
    .join('\n\n  ')}

  <p class="lead">公民館の子ども向けの講座は、回ごとに日にちが決まっているので、<a href="/calendar.html">おでかけカレンダー</a>の「🏛 公民館・児童館」にのせています。</p>

  <h2 class="sec">行く前に</h2>
  <div class="tips">
    <ul>
      <li>児童館・図書館には駐車場がありません。歩き・自転車・バスで。</li>
      <li>おはなし会は、途中からは入れません。少し早めに。</li>
      <li>子育てひろばのプログラムと出張ひろばは、小平市在住の方が対象です。</li>
    </ul>
  </div>

  <p class="about">各施設の公式の案内（ホームページ、おたより、年間の予定表）で、施設ごとに確かめた日を書いています。まとめサイトからの転載はしていません。<br>
  内容のまちがいに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/entei.html">園庭開放・未就園児の会</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/issues.html">バックナンバー</a>
  </div>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script>
(function () {
  var SHOW = ${SHOW_CHIPS};
  var t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  var lim = new Date(Date.now() + 9 * 3600e3 + 13 * 864e5).toISOString().slice(0, 10);
  var age = '';
  try { age = localStorage.getItem('bvt.age') || ''; } catch (e) {}

  // 過ぎた日を隠し、先の SHOW 回だけ見せる
  document.querySelectorAll('.prog').forEach(function (g) {
    var ul = g.querySelector('.dates');
    if (!ul) return;
    var left = [];
    ul.querySelectorAll('li[data-d]').forEach(function (li) {
      if (li.getAttribute('data-d') < t) li.hidden = true; else left.push(li);
    });
    var done = g.querySelector('.done');
    if (!left.length) { ul.hidden = true; if (done && !g.querySelector('.more:not(.done)')) done.hidden = false; return; }
    var btn = g.querySelector('.morebtn');
    if (left.length > SHOW && btn) {
      left.slice(SHOW).forEach(function (li) { li.hidden = true; li.classList.add('later'); });
      btn.hidden = false;
      btn.addEventListener('click', function () {
        ul.querySelectorAll('li.later').forEach(function (li) { li.hidden = false; });
        btn.hidden = true;
      });
    } else if (btn) btn.hidden = true;
  });

  function apply() {
    var ok = function (a) { return !age || a === age || a === 'all'; };
    var shown = 0;
    document.querySelectorAll('#soon .day').forEach(function (day) {
      var d = day.getAttribute('data-d'), n = 0;
      day.querySelectorAll('li[data-age]').forEach(function (li) {
        var on = ok(li.getAttribute('data-age')); li.hidden = !on; if (on) n++;
      });
      var vis = d >= t && d <= lim && n > 0;
      day.hidden = !vis; if (vis) shown++;
    });
    document.getElementById('soon-empty').hidden = shown > 0;
    document.querySelectorAll('.reg li[data-age], .prog[data-age]').forEach(function (el) {
      el.hidden = !ok(el.getAttribute('data-age'));
    });
    document.querySelectorAll('.pl').forEach(function (pl) {
      var any = pl.querySelectorAll('.prog:not([hidden])').length;
      pl.hidden = !!age && pl.querySelectorAll('.prog').length > 0 && !any;
    });
    document.querySelectorAll('.agef button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === age));
    });
  }
  document.querySelectorAll('.agef button').forEach(function (b) {
    b.addEventListener('click', function () {
      age = b.getAttribute('data-f');
      try { localStorage.setItem('bvt.age', age); } catch (e) {}
      apply();
    });
  });
  apply();
})();
</script>
</body>
</html>
`;

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const leak = visible.match(LEAK);
if (leak) {
  console.error(`🔴 公開ページに出せない言葉が入りました: ${leak[0]}`);
  process.exit(1);
}

writeFileSync(OUT, html);
console.log(`wrote ${OUT}（${places.length}か所 / 予約なしで行ける日 ${soon.length}件・決まった曜日 ${regular.length}件）`);
for (const w of warn) console.log('  🔴 ' + w);
