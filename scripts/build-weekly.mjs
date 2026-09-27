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

function card(item, ev, { pick = false } = {}) {
  const a = ev.ages || {};
  const marks = AGES.map((g) => `${g.icon}${a[g.key] || '？'}`).join(' ');
  const rokuto = /多摩六都/.test(`${ev.name}${ev.place}`);
  const note = item.note || ev.kidsNote || '';
  return `
  <article class="card${pick ? ' pick' : ''}">
    <h3>${pick ? '<span class="badge">一推し</span>' : ''}${esc(ev.name)}</h3>
    <ul class="facts">
      <li>🗓 ${esc(ev.when || '')}</li>
      <li>📍 ${esc(ev.place || '')}</li>
      ${ev.cost ? `<li>💴 ${esc(ev.cost)}</li>` : ''}
      ${ev.target ? `<li>👤 ${esc(ev.target)}</li>` : ''}
    </ul>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="foot">
      <span class="marks">${marks}</span>
      ${ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">公式</a>` : ''}
      ${ev.mapq ? `<a href="${esc(mapUrl(ev.mapq))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('地図｜' + ev.name)}">地図</a>` : ''}
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
    <h2>ご協賛</h2>
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
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  .ghead-in { padding-top: .9rem; padding-bottom: .7rem; }
  .ghead h1 { font-size: 1.25rem; margin: 0; }
  .ghead .eyebrow { font-size: .8rem; }
  main { padding: .4rem 0 1rem; font-size: .84rem; }
  .tabs { position: sticky; top: 0; z-index: 5; display: flex; gap: .3rem; background: var(--body, #fff); padding: .5rem 0; border-bottom: 1px solid var(--line); margin-bottom: .6rem; }
  .tabs a { flex: 1; text-align: center; font-family: var(--maru); font-weight: 700; font-size: .8rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .45rem .2rem; min-height: 36px; display: flex; align-items: center; justify-content: center; }
  .tabs a[aria-selected="true"] { background: var(--sky-deep); color: var(--on-sky, #fff); border-color: var(--sky-deep); }
  h2 { font-family: var(--maru); font-size: .92rem; color: var(--sky-deep); margin: 1rem 0 .4rem; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .6rem .75rem; margin-bottom: .5rem; }
  .card.pick { border: 2px solid var(--marigold); }
  .badge { font-size: .68rem; font-weight: 700; color: var(--marigold-ink); background: var(--marigold-wash); border-radius: 999px; padding: .05rem .45rem; margin-right: .35rem; vertical-align: .1em; }
  .card h3 { font-family: var(--maru); font-size: .92rem; line-height: 1.45; margin: 0 0 .3rem; color: var(--ink); }
  .facts { list-style: none; margin: 0; padding: 0; font-size: .8rem; line-height: 1.6; color: var(--ink-soft); }
  .facts li { overflow-wrap: anywhere; }
  .note { font-size: .82rem; line-height: 1.65; margin: .3rem 0 0; }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .4rem; }
  .marks { font-size: .78rem; margin-right: auto; }
  .foot a { font-weight: 700; font-size: .78rem; text-decoration: none; color: var(--sky-deep); background: var(--sky-wash); border-radius: 999px; padding: .35rem .8rem; min-height: 34px; display: inline-flex; align-items: center; }
  .fine { font-size: .7rem; color: var(--ink-faint); margin: .35rem 0 0; }
  .empty { color: var(--ink-faint); font-size: .82rem; }
  .sponsors { margin-top: 1.4rem; border-top: 1px solid var(--line); padding-top: .8rem; font-size: .8rem; color: var(--ink-soft); }
  .sponsors h2 { margin-top: 0; }
  .sponsors ul { padding-left: 1.2em; line-height: 1.8; }
  .sponsors span { margin-left: .5em; color: var(--ink-faint); }
  .stamp { font-size: .74rem; color: var(--ink-faint); margin-top: 1.2rem; line-height: 1.7; }
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
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">${esc(head.eyebrow)}</div>
    <h1>${esc(head.h1)}</h1>
  </div>
</header>
<main class="wrap">
${body}
  <p class="stamp">日程・料金は変わることがあります。おでかけの前に、各公式ページでご確認ください。<br>
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
  ${now.length ? now.map(({ it, ev }) => card(it, ev, { pick: it.id === spec.pick })).join('') : '<p class="empty">今週は、この年齢向けの催しが少なめです。ほかのタブもご覧ください。</p>'}
  ${next.length ? `<h2>先取り・申込の締切</h2>${next.map(({ it, ev }) => card(it, ev)).join('')}` : ''}
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
      head: { eyebrow: issue, h1: '今週のおでかけ' },
      body: tabbed(g.key),
    }));
  }
  writeFileSync(`${outBase}/index.html`, page({
    title: `${issue}｜ぼんぼやーじゅ通信`,
    desc: `${issue}のおでかけ情報を、年齢別に公式ページ・地図つきで。`,
    path: `/week/${date}/`,
    head: { eyebrow: issue, h1: '今週のおでかけ' },
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
