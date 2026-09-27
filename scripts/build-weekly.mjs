#!/usr/bin/env node
/*
 * 号ごとの「年齢別ページ」を作る（2026-10-07号から）。
 *   node scripts/build-weekly.mjs
 *
 * LINEの本文は「今週の一推し」と、年齢別ページへのリンク3本だけにする。
 * 中身（公式リンク・地図つきの全件）はこのページに置く。
 *
 * 入力:
 *   reports/free/web/YYYY-MM-DD.json … その号に載せるイベント（台帳ID）と、ひとこと
 *   docs/homepage/data/events-public.json … 台帳から作った公開データ（build-calendar.mjs が先に作る）
 *   reports/free/sent.log … **送った号だけ**を公開する
 *   data/sponsors.json … 協賛（無ければ出さない）
 * 出力:
 *   docs/homepage/week/YYYY-MM-DD/index.html        … 年齢別と同じ中身（赤ちゃんのタブから）
 *   docs/homepage/week/YYYY-MM-DD/{baby,pre,elem}/  … 年齢別
 *
 * 🔴 **LINEで送る前にページを出さない。**（2026-09-09、下書きの時点でサイトに出て、
 *    LINEの読者よりホームページのほうが先に今週号を読めた。CLAUDE.md 手順7）
 *    sent.log に日付が無い号は、作らない。
 *
 * 🔒 ページにもURLにも、計測の仕組みを書かない。/week/日付/baby は「赤ちゃん向けのページ」であって、
 *    計測用のコードではない（見る人にとって意味のある名前にしてある）。
 *
 * 入力の形（reports/free/web/2026-10-07.json）:
 *   {
 *     "date": "2026-10-07",
 *     "pick": "E105",                                   // 今週の一推し（items の中の1件）
 *     "items": [ { "id": "E105", "note": "ひとこと" }, ... ],   // 今週末・連休
 *     "ahead": [ { "id": "E111", "note": "締切10/5" }, ... ]    // 先取り・締切
 *   }
 *   各ページは、台帳の年齢の目安（◎○）で自動で絞る。◎を先に並べる。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { esc } from './lib/gate.mjs';

const SRC_DIR = 'reports/free/web';
const OUT_DIR = 'docs/homepage/week';
const SITE = 'https://bonvoya.nicomaru.tokyo';

const AGES = [
  { key: 'baby', icon: '👶', tab: '赤ちゃん', label: '赤ちゃん連れ', long: '赤ちゃん（0〜2歳）連れのご家庭へ' },
  { key: 'pre', icon: '🧒', tab: '未就学', label: '未就学の子', long: '未就学の子（3〜6歳）のいるご家庭へ' },
  { key: 'elem', icon: '🎒', tab: '小学生', label: '小学生', long: '小学生のいるご家庭へ' },
];
const WD = ['日', '月', '火', '水', '木', '金', '土'];

// --- 送った号だけ ---
const sent = new Set(
  existsSync('reports/free/sent.log')
    ? readFileSync('reports/free/sent.log', 'utf8').split('\n').map((l) => l.split(/\s+/)[0]).filter(Boolean)
    : []
);

const pub = JSON.parse(readFileSync('docs/homepage/data/events-public.json', 'utf8'));
const byId = new Map(pub.events.map((e) => [e.id, e]));
const sponsors = existsSync('data/sponsors.json') ? JSON.parse(readFileSync('data/sponsors.json', 'utf8')) : [];

// 🔒 ひとことに内部の話が混ざっていたら止める（台帳ID・仕組み・ファイル名）
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度/;

const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const rank = (m) => ({ '◎': 0, '○': 1 }[m] ?? 9);

// --- 見た目（2026-09-27 オーナー指示: 30代のお母さんに刺さる、雑誌のような落ち着いたページに） ---
const WDJ = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ICON = {
  when: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  where: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  cost: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9 8l3 4 3-4M9 13h6M9 16h6M12 12v6"/></svg>',
  who: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7.5A1.5 1.5 0 0 1 5.5 6H10"/></svg>',
};
const AGE_SHORT = { baby: '赤ちゃん', pre: '未就学', elem: '小学生' };
const markClass = (m) => ({ '◎': 'm-best', '○': 'm-ok', '△': 'm-maybe' }[m] || 'm-no');

// 日付の札（左の大きい数字）。複数日は「10/3–4」、長い会期は「〜12/27」
function dateChip(ev) {
  const ds = (ev.dates || []).slice().sort();
  const fmt = (iso) => { const [, m, d] = iso.split('-').map(Number); return { m, d, w: WDJ[new Date(iso + 'T00:00:00Z').getUTCDay()] }; };
  if (ds.length) {
    const a = fmt(ds[0]);
    if (ds.length === 1) return `<div class="chip"><span class="md">${a.m}/${a.d}</span><span class="wd">${a.w}</span></div>`;
    const b = fmt(ds[ds.length - 1]);
    const tail = b.m === a.m ? `–${b.d}` : `–${b.m}/${b.d}`;
    return `<div class="chip"><span class="md">${a.m}/${a.d}<small>${tail}</small></span><span class="wd">${ds.length}DAYS</span></div>`;
  }
  if (ev.span && ev.span.to) { const b = fmt(ev.span.to); return `<div class="chip"><span class="md"><small>〜</small>${b.m}/${b.d}</span><span class="wd">UNTIL</span></div>`; }
  return `<div class="chip"><span class="md">—</span><span class="wd">OPEN</span></div>`;
}

function card(item, ev, { pick = false } = {}) {
  const a = ev.ages || {};
  const ages = AGES.map((g) => `<span class="age ${markClass(a[g.key])}">${AGE_SHORT[g.key]}<b>${esc(a[g.key] || '？')}</b></span>`).join('');
  const rokuto = /多摩六都/.test(`${ev.name}${ev.place}`);
  const note = item.note || ev.kidsNote || '';
  return `
  <article class="card${pick ? ' pick' : ''}">
    ${pick ? '<p class="ribbon"><span>PICK UP</span>今週の一推し</p>' : ''}
    <div class="row">
      ${dateChip(ev)}
      <div class="body">
        <h3>${esc(ev.name)}</h3>
        <ul class="facts">
          <li>${ICON.when}<span>${esc(ev.when || '')}</span></li>
          ${ev.place ? `<li>${ICON.where}<span>${esc(ev.place)}</span></li>` : ''}
          ${ev.cost ? `<li>${ICON.cost}<span>${esc(ev.cost)}</span></li>` : ''}
          ${ev.target ? `<li>${ICON.who}<span>${esc(ev.target)}</span></li>` : ''}
        </ul>
      </div>
    </div>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="ages">${ages}</div>
    <div class="acts">
      ${ev.url ? `<a class="btn ghost" href="${esc(ev.url)}" target="_blank" rel="noopener">公式サイト${ICON.out}</a>` : ''}
      ${ev.mapq ? `<a class="btn solid" href="${esc(mapUrl(ev.mapq))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('地図｜' + ev.name)}">地図をひらく${ICON.out}</a>` : ''}
    </div>
    ${rokuto ? '<p class="fine">※最新の情報は多摩六都科学館ウェブサイトでご確認ください。</p>' : ''}
  </article>`;
}

function sponsorBlock() {
  if (!Array.isArray(sponsors) || !sponsors.length) return '';
  const list = sponsors
    .map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}${s.note ? `<span>${esc(s.note)}</span>` : ''}</li>`)
    .join('');
  return `
  <section class="sponsors">
    <p class="kicker">SUPPORTED BY</p>
    <p>この通信は、次の方々のご協賛で運営しています。</p>
    <ul>${list}</ul>
  </section>`;
}

const page = ({ title, desc, path, head, body }) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/assets/hero-park.jpg">
<meta property="og:locale" content="ja_JP">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&family=Zen+Maru+Gothic:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  :root {
    --w-bg:#FAF6F0; --w-card:#FFFFFF; --w-ink:#3B3530; --w-soft:#766B62; --w-faint:#A3978D; --w-line:#EEE5D9;
    --w-accent:#C9755B; --w-accent-ink:#A5563E; --w-wash:#F8EAE2; --w-sage:#7E9A7A; --w-sage-wash:#EBF0E7; --w-shadow:0 1px 2px rgba(80,60,40,.04),0 6px 18px rgba(80,60,40,.06);
    --w-en:"Jost","Helvetica Neue",Arial,sans-serif; --w-maru:"Zen Maru Gothic",var(--maru);
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --w-bg:#1D1A18; --w-card:#272320; --w-ink:#F1EBE4; --w-soft:#C4B8AD; --w-faint:#90857B; --w-line:#3A342F;
    --w-accent:#E39A7F; --w-accent-ink:#EDB29C; --w-wash:#3A2A24; --w-sage:#A2BC9E; --w-sage-wash:#2A3328; --w-shadow:0 1px 2px rgba(0,0,0,.3);
  } }
  :root[data-theme="dark"] {
    --w-bg:#1D1A18; --w-card:#272320; --w-ink:#F1EBE4; --w-soft:#C4B8AD; --w-faint:#90857B; --w-line:#3A342F;
    --w-accent:#E39A7F; --w-accent-ink:#EDB29C; --w-wash:#3A2A24; --w-sage:#A2BC9E; --w-sage-wash:#2A3328; --w-shadow:0 1px 2px rgba(0,0,0,.3);
  }
  body { background: var(--w-bg); color: var(--w-ink); }
  .hero { position: relative; overflow: hidden; padding: 1.5rem 0 1.1rem; }
  .hero::before, .hero::after { content: ""; position: absolute; border-radius: 50%; filter: blur(2px); z-index: 0; }
  .hero::before { width: 13rem; height: 13rem; right: -3.5rem; top: -5rem; background: radial-gradient(circle, var(--w-wash) 0%, transparent 70%); }
  .hero::after { width: 9rem; height: 9rem; left: -3rem; bottom: -4rem; background: radial-gradient(circle, var(--w-sage-wash) 0%, transparent 70%); }
  .hero .wrap { position: relative; z-index: 1; }
  .kicker { font-family: var(--w-en); font-size: .68rem; letter-spacing: .22em; color: var(--w-accent-ink); margin: 0; }
  .hero h1 { font-family: var(--w-maru); font-weight: 700; font-size: 1.55rem; letter-spacing: .04em; line-height: 1.35; margin: .25rem 0 .2rem; }
  .hero .issue { font-size: .76rem; color: var(--w-soft); }
  main { padding: 0 0 1.5rem; font-size: .84rem; }
  .tabs { position: sticky; top: 0; z-index: 5; display: flex; gap: .25rem; padding: .3rem; margin: 0 0 1rem; background: color-mix(in srgb, var(--w-line) 70%, var(--w-bg)); border-radius: 999px; box-shadow: 0 0 0 .45rem var(--w-bg); }
  .tabs a { flex: 1; text-align: center; font-family: var(--w-maru); font-weight: 700; font-size: .8rem; text-decoration: none; color: var(--w-soft); border-radius: 999px; padding: .5rem .2rem; min-height: 40px; display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s; }
  .tabs a[aria-selected="true"] { background: var(--w-card); color: var(--w-accent-ink); box-shadow: var(--w-shadow); }
  .sec { display: flex; align-items: baseline; gap: .6rem; margin: 1.3rem 0 .6rem; }
  .sec .kicker { flex: none; }
  .sec h2 { font-family: var(--w-maru); font-weight: 700; font-size: .95rem; margin: 0; color: var(--w-ink); }
  .sec::after { content: ""; flex: 1; height: 1px; background: var(--w-line); align-self: center; }
  .card { background: var(--w-card); border-radius: 18px; padding: .8rem .85rem .75rem; margin-bottom: .6rem; box-shadow: var(--w-shadow); }
  .card.pick { background: linear-gradient(160deg, var(--w-wash), var(--w-card) 60%); outline: 1px solid color-mix(in srgb, var(--w-accent) 35%, transparent); }
  .ribbon { display: flex; align-items: center; gap: .5rem; font-family: var(--w-maru); font-weight: 700; font-size: .74rem; color: var(--w-accent-ink); margin: 0 0 .55rem; }
  .ribbon span { font-family: var(--w-en); font-weight: 500; font-size: .62rem; letter-spacing: .18em; color: #fff; background: var(--w-accent); border-radius: 999px; padding: .12rem .55rem; }
  .row { display: flex; gap: .8rem; }
  .chip { flex: none; width: 4.1rem; white-space: nowrap; text-align: center; padding-top: .1rem; border-right: 1px solid var(--w-line); padding-right: .7rem; }
  .chip .md { display: block; font-family: var(--w-en); font-weight: 500; font-size: 1.1rem; line-height: 1.15; color: var(--w-ink); letter-spacing: .01em; }
  .chip .md small { font-size: .72rem; color: var(--w-soft); }
  .chip .wd { display: block; font-family: var(--w-en); font-size: .6rem; letter-spacing: .16em; color: var(--w-accent-ink); margin-top: .15rem; }
  .body { min-width: 0; flex: 1; }
  .card h3 { font-family: var(--w-maru); font-weight: 700; font-size: .95rem; line-height: 1.5; margin: 0 0 .35rem; }
  .facts { list-style: none; margin: 0; padding: 0; font-size: .75rem; line-height: 1.55; color: var(--w-soft); }
  .facts li { display: flex; gap: .35rem; align-items: flex-start; overflow-wrap: anywhere; }
  .facts svg { flex: none; width: 13px; height: 13px; margin-top: .22rem; fill: none; stroke: var(--w-faint); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .note { font-size: .78rem; line-height: 1.7; margin: .5rem 0 0; padding: .45rem .65rem; background: color-mix(in srgb, var(--w-sage-wash) 70%, transparent); border-radius: 12px; }
  .ages { display: flex; flex-wrap: wrap; gap: .3rem; margin: .6rem 0 0; }
  .age { font-size: .68rem; color: var(--w-soft); border-radius: 999px; padding: .1rem .5rem; border: 1px solid var(--w-line); }
  .age b { font-weight: 700; margin-left: .2rem; }
  .age.m-best { background: var(--w-wash); border-color: transparent; color: var(--w-accent-ink); }
  .age.m-ok { background: var(--w-sage-wash); border-color: transparent; color: color-mix(in srgb, var(--w-sage) 70%, var(--w-ink)); }
  .age.m-no { opacity: .55; }
  .acts { display: flex; gap: .45rem; margin-top: .55rem; }
  .btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; min-height: 38px; border-radius: 999px; font-family: var(--w-maru); font-weight: 700; font-size: .76rem; text-decoration: none; }
  .btn svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .btn.ghost { color: var(--w-ink); border: 1px solid var(--w-line); background: transparent; }
  .btn.solid { color: #fff; background: var(--w-accent); }
  .fine { font-size: .66rem; color: var(--w-faint); margin: .5rem 0 0; }
  .empty { color: var(--w-faint); font-size: .8rem; text-align: center; padding: 1.2rem 0; }
  .sponsors { margin-top: 1.8rem; padding: 1rem 1.1rem; border-radius: 18px; background: var(--w-card); box-shadow: var(--w-shadow); font-size: .78rem; color: var(--w-soft); }
  .sponsors ul { padding-left: 1.1em; margin: .4rem 0 0; line-height: 1.9; }
  .sponsors span { margin-left: .5em; color: var(--w-faint); }
  .stamp { font-size: .7rem; color: var(--w-faint); margin-top: 1.4rem; line-height: 1.8; text-align: center; }
  .back { font-size: .8rem; }
</style>
</head>
<body>
<nav class="bvnav" aria-label="サイト内">
  <div class="bvnav-in">
    <a class="bvnav-brand" href="/">ぼんぼやーじゅ通信</a>
    <div class="bvnav-links">
      <a href="/calendar.html"><span class="bv-lg">おでかけ</span>カレンダー</a>
      <a href="/map.html"><span class="bv-lg">おでかけ</span>マップ</a>
      <a href="/issues.html">バックナンバー</a>
    </div>
  </div>
</nav>
<header class="hero">
  <div class="wrap">
    <p class="kicker">${esc(head.kicker)}</p>
    <h1>${esc(head.h1)}</h1>
    <p class="issue">${esc(head.issue)}</p>
  </div>
</header>
<main class="wrap">
${body}
  <p class="stamp">日程・料金は変わることがあります。おでかけの前に、各公式サイトでご確認ください。<br>
    市や施設の公式ページで一件ずつ確かめています。</p>
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

// --- 号ごとに組む ---
const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
let built = 0;
const problems = [];

for (const f of files) {
  const date = f.slice(0, 10);
  const outBase = `${OUT_DIR}/${date}`;
  if (!sent.has(date)) {
    // 送っていない号は出さない。前に組んだものが残っていたら消す（取り消した号など）
    if (existsSync(outBase)) rmSync(outBase, { recursive: true, force: true });
    console.log(`  ${date}: まだ送っていないので作らない`);
    continue;
  }
  const spec = JSON.parse(readFileSync(`${SRC_DIR}/${f}`, 'utf8'));
  const resolve = (list) =>
    (list || []).map((it) => {
      const ev = byId.get(it.id);
      if (!ev) problems.push(`${date}: ${it.id} が公開データに無い（ステータスが見送り・保留か、日付が取れていない）`);
      else if (!(ev.ages && ev.ages.baby && ev.ages.pre && ev.ages.elem))
        problems.push(`${date}: ${it.id} に年齢の目安（👶🧒🎒）が3つそろっていない。どのタブに出すか決められない`);
      if (it.note && LEAK.test(it.note)) problems.push(`${date}: ${it.id} のひとことに内部の話が入っている: ${it.note}`);
      return ev ? { it, ev } : null;
    }).filter(Boolean);
  const items = resolve(spec.items);
  const ahead = resolve(spec.ahead);

  const [y, m, d] = date.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const issue = `${m}/${d}(${wd})号`;

  const forAge = (list, key) =>
    list.filter(({ ev }) => ['◎', '○'].includes((ev.ages || {})[key]))
      // その年齢に◎のものを先に。同じ印の中では一推しを先に（赤ちゃんのページで、○の一推しより◎を上に）
      .sort((p, q) => rank(p.ev.ages[key]) - rank(q.ev.ages[key]) || (q.it.id === spec.pick) - (p.it.id === spec.pick));

  // 年齢別。**どのページにも3つの年齢の中身が入っていて、タブで切り替える**（ページは読み直さない）。
  // LINEで押したリンクのページ（= 最初に開いたタブ）だけが数えられるので、
  // 「どの年齢のリンクが押されたか」が、タブの切り替えで水増しされない。
  const panel = (g) => {
    const now = forAge(items, g.key);
    const next = forAge(ahead, g.key);
    return `<section class="panel" id="${g.key}" data-age="${g.key}">
  <div class="sec"><p class="kicker">THIS WEEK</p><h2>今週のおでかけ</h2></div>
  ${now.length ? now.map(({ it, ev }) => card(it, ev, { pick: it.id === spec.pick })).join('') : '<p class="empty">今週は、この年齢向けの催しが少なめです。ほかのタブもご覧ください。</p>'}
  ${next.length ? `<div class="sec"><p class="kicker">COMING UP</p><h2>先取り・申込の締切</h2></div>${next.map(({ it, ev }) => card(it, ev)).join('')}` : ''}
</section>`;
  };
  const tabbed = (active) => `
  <nav class="tabs" role="tablist" aria-label="年齢">
    ${AGES.map((g) => `<a role="tab" href="/week/${date}/${g.key}/" data-tab="${g.key}" aria-selected="${g.key === active}">${g.icon} ${esc(g.tab)}</a>`).join('')}
  </nav>
  ${AGES.map(panel).join('\n')}
  ${sponsorBlock()}
  <script>
  (function () {
    var tabs = document.querySelectorAll('.tabs a'), panels = document.querySelectorAll('.panel');
    function show(k) {
      for (var i = 0; i < panels.length; i++) panels[i].hidden = panels[i].getAttribute('data-age') !== k;
      for (var j = 0; j < tabs.length; j++) tabs[j].setAttribute('aria-selected', tabs[j].getAttribute('data-tab') === k);
    }
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) {
      e.preventDefault(); show(this.getAttribute('data-tab')); window.scrollTo(0, 0);
    });
    show(${JSON.stringify(active)});
  })();
  </script>`;

  for (const g of AGES) {
    mkdirSync(`${outBase}/${g.key}`, { recursive: true });
    writeFileSync(`${outBase}/${g.key}/index.html`, page({
      title: `${g.icon} ${g.label}｜${issue}｜ぼんぼやーじゅ通信`,
      desc: `${issue}のおでかけ情報を、年齢別に公式ページ・地図つきで。`,
      path: `/week/${date}/${g.key}/`,
      head: { kicker: `WEEKEND GUIDE · ${m}.${String(d).padStart(2, '0')} ${WDJ[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`, h1: '今週のおでかけ', issue: `ぼんぼやーじゅ通信 ${issue}` },
      body: tabbed(g.key),
    }));
  }
  writeFileSync(`${outBase}/index.html`, page({
    title: `${issue}｜ぼんぼやーじゅ通信`,
    desc: `${issue}のおでかけ情報を、年齢別に公式ページ・地図つきで。`,
    path: `/week/${date}/`,
    head: { kicker: `WEEKEND GUIDE · ${m}.${String(d).padStart(2, '0')} ${WDJ[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`, h1: '今週のおでかけ', issue: `ぼんぼやーじゅ通信 ${issue}` },
    body: tabbed('baby'),
  }));
  built++;
  console.log(`  ${date}: ${issue} 今週末${items.length}件・先取り${ahead.length}件 → /week/${date}/ と baby/pre/elem`);
}

if (problems.length) {
  console.error('\n🔴 直してから公開すること:');
  for (const p of problems) console.error('   ' + p);
  process.exit(1);
}
console.log(`\n年齢別ページ ${built}号ぶん`);
