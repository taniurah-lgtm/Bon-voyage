#!/usr/bin/env node
/*
 * 園庭開放・未就園児の会のページを組む。
 *   node scripts/build-entei.mjs
 *
 *   data/entei.json → docs/homepage/entei.html
 *
 * 日付のあるイベント（台帳・カレンダー）と違い、これは「くり返し開かれる会」なので
 * 園ごとにまとめる。2026-10-05 オーナー提案で作った（カテゴリ別のまとめページの1つめ）。
 *
 * ★ここに書くのは、各園の公式ページで確かめた事実だけ。
 *   時間・費用・予約が書いていない園は null のままにし、ページにも「案内なし」と出す。推測で埋めない。
 * ★過ぎた日は、ページを開いた日に合わせてブラウザ側で隠す（組み直さなくても古くならない）。
 *   組んだ日の時点で過ぎている日は、最初から出さない。
 * ★確かめた日（checked）から45日を過ぎた園は、組むたびに🔴で知らせる。見直しの合図。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/entei.json';
const OUT = 'docs/homepage/entei.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const STALE_DAYS = 45;

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

// ── 検査 ──────────────────────────────────────────────
const problems = [];
const warn = [];
for (const p of data.places) {
  if (!p.checked) problems.push(`${p.name}: checked（確かめた日）が無い`);
  else if (daysBetween(p.checked, todayJST) > STALE_DAYS) warn.push(`${p.name}: 確かめてから ${daysBetween(p.checked, todayJST)} 日。公式ページを見直す`);
  for (const g of p.programs) {
    for (const x of g.dates || []) {
      const d = typeof x === 'string' ? x : x.d;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) problems.push(`${p.name}「${g.title}」: 日付の形がおかしい ${d}`);
      if (g.weekly && dow(d) !== g.weekly) problems.push(`${p.name}「${g.title}」: ${d} は${dow(d)}曜（${g.weekly}曜のはず）`);
    }
    const upcoming = (g.dates || []).map((x) => (typeof x === 'string' ? x : x.d)).filter((d) => d >= todayJST);
    if (!g.weekly && !upcoming.length && !g.more) warn.push(`${p.name}「${g.title}」: これからの日が無い。次の日程を公式で探すか、more に「まだ出ていない」と書く`);
  }
}
// _about（このファイルの説明）は公開しないので除いて見る
const { _about, ...pub } = data;
const allText = JSON.stringify(pub);
for (const m of allText.matchAll(new RegExp(LEAK, 'g'))) problems.push(`🔒 公開に出せない言葉: ${m[0]}`);
if (CONTACT.test(allText)) problems.push('🔒 個人の連絡先（携帯・メール）らしきものがある');
if (problems.length) {
  console.error('🔴 組めません:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ── 並び順 ────────────────────────────────────────────
// 町名の五十音。書き手の地元（花小金井）や、つながりのある園を先頭にしないため。
const TOWN_ORDER = ['小川町', '小川東町', '学園西町', '学園東町', '上水新町', '上水本町', '上水南町', '鈴木町', '仲町', '花小金井', '回田町'];
const townRank = (t) => (TOWN_ORDER.includes(t) ? TOWN_ORDER.indexOf(t) : 99);
for (const list of [data.places, data.others]) {
  for (const x of list) if (!TOWN_ORDER.includes(x.town)) problems.push(`${x.name}: 町名「${x.town}」の並び順が未登録（TOWN_ORDER に足す）`);
  list.sort((a, b) => townRank(a.town) - townRank(b.town) || a.name.localeCompare(b.name, 'ja'));
}
if (problems.length) { console.error('🔴 組めません:\n  ' + problems.join('\n  ')); process.exit(1); }

// ── 部品 ──────────────────────────────────────────────
const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(short(p.name) + ' ' + p.addr)}`;
const fmtChecked = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;

function dateChips(g) {
  const items = (g.dates || []).map((x) => (typeof x === 'string' ? { d: x } : x)).filter((x) => x.d >= todayJST);
  if (!items.length) return '';
  return `<ul class="dates">${items
    .map((x) => `<li data-d="${x.d}"><b>${label(x.d)}</b>${x.t ? `<span>${esc(x.t)}</span>` : ''}</li>`)
    .join('')}</ul>`;
}

function row(k, v) {
  return v ? `<div class="kv"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : '';
}

function program(g) {
  const tag = g.open
    ? '<span class="tag ok">予約なしで行ける</span>'
    : g.book
      ? '<span class="tag bk">申込みがいる</span>'
      : '';
  const when = g.when ? `<p class="when">${esc(g.when)}</p>` : '';
  const chips = dateChips(g);
  const more = g.more ? `<p class="more">${esc(g.more)}</p>` : '';
  // 日付が全部過ぎた（ブラウザ側で判定）ときに出す一言
  const done = !g.weekly ? `<p class="more done" hidden>今年度ここに出ている日は終わりました。次の日程は園のページで。</p>` : '';
  return `<div class="prog">
        <h3>${esc(g.title)} ${tag}</h3>
        ${when}${chips}${more}${done}
        <div class="kvs">
          ${row('時間', g.time)}
          ${row('対象', g.who)}
          ${row('費用', g.cost)}
          ${row('予約', g.book ?? '園のページに予約の案内はありません')}
          ${row('雨の日', g.rain)}
        </div>
        ${(g.notes || []).length ? `<ul class="notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
}

function place(p) {
  const link2 = p.url2 ? ` <a class="lk" href="${esc(p.url2.href)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜sns">${esc(p.url2.label)}</a>` : '';
  return `<article class="en" id="${p.key}">
      <div class="en-h">
        <h2>${esc(p.name)}</h2>
        <p class="town">${esc(p.town)}</p>
      </div>
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      ${p.programs.map(program).join('\n      ')}
      ${p.footnote ? `<p class="fn">${esc(p.footnote)}</p>` : ''}
      <div class="en-f">
        <span class="chk">${fmtChecked(p.checked)}に、園の公式ページで確かめました</span>
        <span class="acts">
          <a class="lk" href="${esc(p.url)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜公式">公式ページ</a>${link2}
          <a class="lk" href="${mapUrl(p)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜地図">地図</a>
        </span>
      </div>
    </article>`;
}

// 「これから2週間」の材料（予約なしで行ける・日付のあるもの）
const soon = [];
for (const p of data.places) {
  for (const g of p.programs) {
    if (!g.open) continue;
    for (const x of g.dates || []) {
      const d = typeof x === 'string' ? x : x.d;
      soon.push({ d, en: short(p.name), key: p.key, t: (typeof x === 'object' && x.t) || g.title, time: g.time || '' });
    }
  }
}
soon.sort((a, b) => a.d.localeCompare(b.d) || a.en.localeCompare(b.en, 'ja'));
const weekly = [];
for (const p of data.places) for (const g of p.programs) if (g.open && g.weekly) weekly.push({ en: short(p.name), key: p.key, wd: g.weekly, t: g.title, time: g.time || '', when: g.when });

const soonRows = soon
  .filter((x) => x.d >= todayJST)
  .map((x) => `<li data-d="${x.d}"><span class="sd">${label(x.d)}</span><span class="sb"><a href="#${x.key}">${esc(x.en)}</a> ${esc(x.t)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</span></li>`)
  .join('\n        ');
const weeklyRows = weekly
  .map((x) => `<li><span class="sd">毎週${x.wd}</span><span class="sb"><a href="#${x.key}">${esc(x.en)}</a> ${esc(x.t)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</span></li>`)
  .join('\n        ');

const n = data.places.length + data.others.length;
const title = '園庭開放・未就園児の会（小平の幼稚園・こども園）';
const desc = `小平市内の私立幼稚園・こども園${n}園の、園庭開放と未就園児向けの会。曜日・時間・対象・予約のいる・いらないを、各園の公式ページで一園ずつ確かめてまとめています。`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/entei.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/entei.html">
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
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.6rem 0 .6rem; }

  /* これから2週間 */
  .soon { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: .9rem 1rem; }
  .soon h3 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0 0 .45rem; color: var(--sky-deep); }
  .soon h3 + ul { margin-bottom: .2rem; }
  .soon ul { list-style: none; margin: 0 0 .8rem; padding: 0; }
  .soon li { display: flex; gap: .7rem; padding: .38rem 0; border-top: 1px dashed var(--line); font-size: .88rem; line-height: 1.55; }
  .soon li:first-child { border-top: 0; }
  .soon .sd { flex: none; width: 4.6em; font-family: var(--maru); font-weight: 800; color: var(--ink); }
  .soon .sb a { font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .soon small { display: block; color: var(--ink-faint); font-size: .76rem; }
  .soon .empty { color: var(--ink-soft); font-size: .86rem; }
  .soon .wk { font-size: .78rem; color: var(--ink-faint); margin-top: .2rem; }

  /* 園ごと */
  .en { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: 1rem 1.05rem .8rem; margin-bottom: .9rem; scroll-margin-top: 64px; }
  .en-h { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .en h2 { font-family: var(--maru); font-weight: 800; font-size: 1.04rem; margin: 0; line-height: 1.4; }
  .town { font-size: .78rem; color: var(--ink-faint); }
  .intro { font-size: .86rem; color: var(--ink-soft); margin-top: .35rem; line-height: 1.7; }
  .prog { margin-top: .8rem; padding-top: .7rem; border-top: 1px solid var(--line); }
  .prog:first-of-type { border-top: 0; padding-top: 0; }
  .prog h3 { font-family: var(--maru); font-weight: 800; font-size: .94rem; margin: 0 0 .35rem; line-height: 1.5; }
  .tag { display: inline-block; font-size: .66rem; font-weight: 700; border-radius: 999px; padding: .05rem .5rem; vertical-align: .12em; margin-left: .2rem; white-space: nowrap; }
  .tag.ok { background: var(--sky-wash); color: var(--sky-deep); }
  .tag.bk { background: var(--marigold-wash); color: var(--marigold-ink); }
  .when { font-size: .88rem; font-weight: 700; margin-bottom: .3rem; }
  .dates { list-style: none; margin: 0 0 .45rem; padding: 0; display: flex; flex-wrap: wrap; gap: .3rem; }
  .dates li { font-size: .8rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: .1rem .45rem; line-height: 1.6; }
  .dates li b { font-family: var(--maru); }
  .dates li span { margin-left: .3rem; color: var(--ink-soft); }
  .more { font-size: .82rem; color: var(--ink-soft); background: var(--surface-2); border-radius: 8px; padding: .35rem .6rem; margin-bottom: .45rem; line-height: 1.65; }
  .kvs { display: grid; gap: .12rem; }
  .kv { display: flex; gap: .6rem; font-size: .84rem; line-height: 1.6; }
  .kv .k { flex: none; width: 3.6em; color: var(--ink-faint); font-size: .78rem; padding-top: .08rem; }
  .notes { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .8rem; color: var(--ink-soft); line-height: 1.65; }
  .fn { font-size: .78rem; color: var(--ink-faint); margin-top: .6rem; line-height: 1.6; }
  .en-f { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .6rem; margin-top: .7rem; padding-top: .5rem; border-top: 1px solid var(--line); }
  .chk { font-size: .72rem; color: var(--ink-faint); }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .75rem; background: var(--surface); white-space: nowrap; }

  /* 園の目次 */
  .idx { display: grid; gap: .3rem; margin: 0 0 1.1rem; font-size: .84rem; }
  .idx div { display: grid; grid-template-columns: 4.6em 1fr; align-items: baseline; gap: .7rem; }
  .idx .it { font-size: .74rem; color: var(--ink-faint); }
  .idx .il { display: flex; flex-wrap: wrap; gap: 0 .8rem; }
  .idx a { font-weight: 700; color: var(--link-ink); text-decoration: none; min-height: 32px; display: inline-flex; align-items: center; }

  /* ほかの園 */
  .others { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  .others li { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .7rem .9rem; font-size: .85rem; line-height: 1.7; }
  .others b { font-family: var(--maru); }
  .others .town { margin-left: .4rem; }
  .others a { font-size: .78rem; font-weight: 700; margin-left: .3rem; }

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
    <h1>園庭開放と<br>未就園児の会</h1>
    <p class="sub">入園前の子と、幼稚園の園庭で遊べる日。小平市内の私立幼稚園・こども園${n}園の公式ページを、一園ずつ確かめてまとめました。</p>
  </div>
</header>

<main class="wrap">
  <p class="lead">在園していなくても参加できる会だけを載せています。2歳児クラスのような入会制のプレ教室は、このページでは扱っていません。雨や園の行事で中止になる日があるので、<b>出かける前に各園のページで</b>確かめてください。</p>

  <section class="soon" aria-labelledby="soon-h">
    <h3 id="soon-h">これから2週間の、予約なしで行ける日</h3>
    <ul id="soon">
        ${soonRows}
    </ul>
    <p class="empty" id="soon-empty" hidden>この2週間に日付の決まった会は見つかっていません。下の「毎週」の園や、各園のページをご覧ください。</p>
    <h3>毎週ひらいている園</h3>
    <ul>
        ${weeklyRows}
    </ul>
    <p class="wk">毎週の会も、お休みの週や中止の日があります。各園の案内をご覧ください。</p>
  </section>

  <h2 class="sec">園ごとの案内</h2>
  <nav class="idx" aria-label="園の一覧">
    ${(() => {
      const by = new Map();
      for (const p of data.places) by.set(p.town, [...(by.get(p.town) || []), p]);
      return [...by].map(([t, ps]) => `<div><span class="it">${esc(t)}</span><span class="il">${ps.map((p) => `<a href="#${p.key}">${esc(short(p.name))}</a>`).join('')}</span></div>`).join('\n    ');
    })()}
  </nav>
  ${data.places.map(place).join('\n  ')}

  <h2 class="sec">ほかの園</h2>
  <p class="lead">公式ページに、在園していなくても参加できる会の日程が見つからなかった園です。</p>
  <ul class="others">
    ${data.others
      .map((o) => `<li><b>${esc(o.name)}</b><span class="town">${esc(o.town)}</span><br>${esc(o.text)}<a href="${esc(o.url)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(o.name))}｜公式">園のページ</a></li>`)
      .join('\n    ')}
  </ul>

  <h2 class="sec">行く前に</h2>
  <div class="tips">
    <ul>
      <li>園は、在園の子どもたちが毎日すごしている場所です。飲食・おもちゃ・自転車など、各園のお願いを守って。</li>
      <li>駐車場のない園がほとんどです。歩き・自転車・バスで。</li>
      <li>園庭では、在園の子どもたちも遊んでいることがあります。お子さんから目を離さずに。</li>
      <li>入園を考えている園なら、ふだんの雰囲気を見られる機会にもなります。</li>
    </ul>
  </div>

  <p class="about">各園の公式ページ（園のInstagramを含む）で、園ごとに確かめた日を書いています。まとめサイトからの転載はしていません。<br>
  内容のまちがいや、載っていない会に気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。園の方からのご連絡も歓迎です。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
    <a href="/guide.html">おでかけガイド</a>
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
/* 開いた日に合わせて、過ぎた日を隠す（組んだ日より後に開いても古くならないように） */
(function () {
  var t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  var lim = new Date(Date.now() + (9 * 3600e3) + 13 * 864e5).toISOString().slice(0, 10);
  document.querySelectorAll('.dates li[data-d]').forEach(function (li) {
    if (li.getAttribute('data-d') < t) li.hidden = true;
  });
  document.querySelectorAll('.prog').forEach(function (g) {
    var ul = g.querySelector('.dates'), done = g.querySelector('.done');
    if (!ul || !done) return;
    var left = ul.querySelectorAll('li:not([hidden])').length;
    if (!left) { ul.hidden = true; if (!g.querySelector('.more:not(.done)')) done.hidden = false; }
  });
  var shown = 0;
  document.querySelectorAll('#soon li[data-d]').forEach(function (li) {
    var d = li.getAttribute('data-d');
    var on = d >= t && d <= lim;
    li.hidden = !on; if (on) shown++;
  });
  if (!shown) document.getElementById('soon-empty').hidden = false;
})();
</script>
</body>
</html>
`;

if (LEAK.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
  const m = html.replace(/<script[\s\S]*?<\/script>/g, '').match(LEAK);
  console.error(`🔴 公開ページに出せない言葉が入りました: ${m[0]}`);
  process.exit(1);
}

writeFileSync(OUT, html);
const upcoming = soon.filter((x) => x.d >= todayJST);
console.log(`wrote ${OUT}（${data.places.length}園＋ほか${data.others.length}園 / 予約なしで行ける日 ${upcoming.length}件・毎週 ${weekly.length}件）`);
for (const w of warn) console.log('  🔴 ' + w);
