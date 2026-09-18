#!/usr/bin/env node
/*
 * 公開用のおでかけカレンダーを作る。
 *   node scripts/build-calendar.mjs
 *
 * 入力: data/events.json（全件・非公開）
 * 出力: docs/homepage/calendar.html
 *       docs/homepage/data/events-public.json … 台帳の予定を**全部**入れる
 *
 * ★2026-09-04: 月額制度の廃止にともない、「今日から2週間ぶんだけ公開」という
 *   窓をやめた（`docs/strategy-2026-09.md`）。先の予定・過ぎた予定・締切を
 *   先のぶんまで、会員ページに置いていたものを全部こちらへ移した。
 *   出さないのは台帳の内部メモ（source / confidence / status）だけ。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN = 'data/events.json';
const OUT = 'docs/homepage/calendar.html';
const OUT_JSON = 'docs/homepage/data/events-public.json';

const src = JSON.parse(readFileSync(IN, 'utf8'));
// ★「今日」は日本時間で決める。toISOString() は UTC なので、JST の 0〜9時に走ると
//   前日になり、窓が1日前から始まってしまう（Actions のランナーは UTC）。
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 公開に出すもの: 台帳にあるもの全部。暫定（日程が未確定）も出す。
// マス目には置かず「🔎 日程がまだ確定していないもの」に並ぶだけなので、確定情報と混ざらない。
// 台帳の内部メモは公開データに入れない。表示していなくても、公開している
// JSON なのでそのまま読める（会員ページ側は意図的に落としているのに、
// 公開側のほうが緩いという逆転になっていた）。
const INTERNAL = ['source', 'confidence', 'status'];
const stripInternal = (e) => {
  const out = { ...e };
  for (const k of INTERNAL) delete out[k];
  return out;
};

const pub = src.events
  .filter((e) => (e.dates || []).length)
  .map((e) => stripInternal(e));

// 会期もの（「〜10/14まで」のように期間で開いているもの）。
// ★日付を持つものは pub にもう入っている。両方に入れると公開データに同じIDが
//   2件並び、カレンダーのマス目に同じカードが2枚出る（E74で発生していた）。
const spanPubIds = new Set(pub.map((e) => e.id));
const spans = src.events
  .filter((e) => e.span && (!e.span.to || e.span.to >= today))
  .filter((e) => !spanPubIds.has(e.id))
  .map((e) => stripInternal(e));

// 日付を持たず、締切だけがあるもの（申込を受け付けている段階のもの）。
const pubIds = new Set(pub.concat(spans).map((e) => e.id));
const deadlineOnly = src.events
  .filter((e) => e.deadline && e.deadline.date >= today)
  .filter((e) => !pubIds.has(e.id))
  .map((e) => ({ ...stripInternal(e), dates: [] }));

mkdirSync('docs/homepage/data', { recursive: true });
writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      generated: src.generated,
      events: pub.concat(spans, deadlineOnly),
      standing: (src.standing || []).map(stripInternal),
    },
    null,
    1
  )
);

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JS無効のときに出る一覧も、日付の書き方を画面と同じ「8月24日(月)」に揃える。
// ISO（2026-08-24）のままだと、同じページの中で表記が2種類あることになる。
// ★UTCのメソッドで曜日を出す（ランナーがUTCなので、ローカル版だと1日ずれる）。
const jpDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const [, yy, mm, dd] = m.map(Number);
  const wd = '日月火水木金土'[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
  return `${mm}月${dd}日(${wd})`;
};

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>おでかけカレンダー｜ぼんぼやーじゅ通信</title>
<meta name="description" content="花小金井・小平まわりの子連れで行けるイベントを、日付が見えるカレンダーで。先の予定も申込の締切もまとめて。気になる日をタップして、そのままご自分のカレンダーに保存できます。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/calendar.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/calendar.html">
<meta property="og:title" content="おでかけカレンダー｜ぼんぼやーじゅ通信">
<meta property="og:description" content="花小金井まわりの子連れイベントを、日付から探せるカレンダーに。">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-calendar.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  main { padding: .9rem 0 1rem; }
  .lead { color: var(--ink-soft); font-size: .85rem; margin-bottom: .6rem; line-height: 1.7; }
  /* 主機能（日をタップする）が初回スクロールなしで見えるように、この頁だけ見出しを詰める。
     以前は見出し＋リード＋ピルで約790px使い、カレンダーの表が画面の外にあった。 */
  .ghead-in { padding-top: 1.1rem; padding-bottom: .95rem; }
  .ghead h1 { font-size: clamp(1.4rem, 4.4vw, 1.9rem); margin-bottom: .25rem; }
  .ghead .eyebrow { font-size: .95rem; margin-bottom: .1rem; }
  .ghead .sub { font-size: .9rem; line-height: 1.7; }
  /* ページ内のほかの行き先は、カレンダーの下に置く（上に置くと表が押し下がる） */
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.6rem 0 0; }
  .nav-pills a {
    font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none;
    color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong);
    border-radius: 999px; padding: .4rem .9rem;
  }
  .noscript {
    background: var(--marigold-wash); border: 1px solid var(--marigold);
    border-radius: 14px; padding: 1rem 1.15rem; font-size: .9rem; margin-bottom: 1.2rem;
  }
  .fallback { margin-top: 1rem; }
  .fallback h3 { font-family: var(--maru); font-weight: 800; font-size: .95rem; margin: 1.1rem 0 .4rem; }
  .fallback li { font-size: .9rem; }
  .stamp { font-size: .8rem; color: var(--ink-faint); margin-top: 2rem; }
</style>
</head>
<body>
<nav class="bvnav" aria-label="サイト内">
  <div class="bvnav-in">
    <a class="bvnav-brand" href="/">ぼんぼやーじゅ通信</a>
    <div class="bvnav-links">
      <a href="/" class="bv-hide-sm">通信について</a>
      <a href="/calendar.html" aria-current="page"><span class="bv-lg">おでかけ</span>カレンダー</a>
      <a href="/map.html"><span class="bv-lg">おでかけ</span>マップ</a>
      <a class="bvnav-cta" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>おでかけカレンダー</h1>
    <p class="sub">花小金井・小平まわりの子連れイベントを、日付から。</p>
  </div>
</header>

<main class="wrap">
  <p class="lead">点の日に予定あり。タップでその日の予定が出ます。<b>台帳にある予定を、先のぶんまで全部</b>のせています。</p>

  <noscript>
    <div class="noscript">このカレンダーは表示にJavaScriptを使っています。切っている場合は、下の一覧をご覧ください。</div>
  </noscript>

  <!-- 「読み込んでいます」は JS 側で入れる。noscript のときに残ると案内が二重になる -->
  <div id="cal"></div>

  <!-- JavaScript が動かない環境と、検索エンジン向けの一覧。中身は上のカレンダーと同じ。 -->
  <div class="fallback">
    <h2 class="bvc-tailhead">これからの予定（一覧）</h2>
${(() => {
  // JS無しの一覧は「これから8週間ぶん」に絞る（全期間を出すと数百行になり読めない）。
  // カレンダー本体（JSが動く側）は台帳の全期間を持っている。
  const FALLBACK_TO = new Date(Date.parse(today + 'T00:00:00Z') + 56 * 86400000)
    .toISOString().slice(0, 10);
  const byDate = {};
  for (const e of pub) {
    if (e.tentative) continue;
    for (const d of e.dates) if (d >= today && d <= FALLBACK_TO) (byDate[d] ||= []).push(e);
  }
  // 本体（カレンダー）と同じ「子連れで行きやすい順」に揃える。
  // 順序が違うと、JSの有無で並びが変わって混乱する。
  const pt = { '◎': 3, '○': 2, '△': 1, '✕': 0, x: 0 };
  const score = (e) => {
    const a = e.ages || {};
    if (a.baby || a.pre || a.elem) return (pt[a.baby] || 0) + (pt[a.pre] || 0) + (pt[a.elem] || 0);
    if (a.overall) {
      if (/✕|x/.test(a.overall)) return 0;
      if (/^◎/.test(a.overall)) return 9;
      if (/△\s*[〜~]\s*○|○\s*[〜~]\s*△/.test(a.overall)) return 4;
      if (/^○/.test(a.overall)) return 6;
      if (/^△/.test(a.overall)) return 3;
    }
    return 1;
  };
  for (const d of Object.keys(byDate)) byDate[d].sort((a, b) => score(b) - score(a));
  const days = Object.keys(byDate).sort();
  // JS が動かないときに出る一覧。カレンダー側にあるものは全部入れる
  //（締切・会期・日程未確定を落としていて、本体と食い違っていた）
  const extra = [];
  const dl = pub.concat(deadlineOnly).filter((e) => e.deadline && e.deadline.date >= today);
  if (dl.length) {
    extra.push('    <h3>申込の締切</h3>\n    <ul>' +
      dl.sort((a, b) => a.deadline.date.localeCompare(b.deadline.date)).map((e) =>
        `<li>${esc(jpDay(e.deadline.date))} まで — ${esc(e.name)}${e.when ? `（開催 ${esc(e.when)}）` : ''}</li>`).join('') +
      '</ul>');
  }
  if (spans.length) {
    extra.push('    <h3>会期中ずっと見られるもの</h3>\n    <ul>' +
      spans.map((e) => `<li>${esc(e.name)}${e.span && e.span.to ? `（${esc(jpDay(e.span.to))} まで）` : ''}</li>`).join('') +
      '</ul>');
  }
  const tent = pub.filter((e) => e.tentative);
  if (tent.length) {
    extra.push('    <h3>日程がまだ確定していないもの</h3>\n    <p class="lead">例年の時期から拾ったものです。公式で確認してからお出かけください。</p>\n    <ul>' +
      tent.map((e) => `<li>${esc(e.name)}（${esc(e.when || '')}）</li>`).join('') +
      '</ul>');
  }
  if (!days.length) return '    <p class="lead">いまのところ、確定した予定はありません。</p>\n' + extra.join('\n');
  return days
    .map((d) => {
      const label = jpDay(d);
      const items = byDate[d]
        .map(
          (e) =>
            `      <li>${esc(e.name)}${
              (e.programs && e.programs[d])
                ? `（${esc(e.programs[d].label)} ${esc(e.programs[d].start)}〜${esc(e.programs[d].end || '')}）`
                : e.start ? `（${esc(e.start)}〜${e.timeUncertain ? '・時間は要確認' : ''}）` : ''
            }${
              e.place ? ` — ${esc(e.place.split(/[、(]/)[0])}` : ''
            }${e.url ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">公式</a>` : ''}</li>`
        )
        .join('\n');
      return `    <h3>${label}</h3>\n    <ul>\n${items}\n    </ul>`;
    })
    .join('\n') + (extra.length ? '\n' + extra.join('\n') : '');
})()}
  </div>

  <p class="stamp">情報の更新日: ${esc(src.generated)}　※日程・料金は変わることがあります。おでかけ前に各公式でご確認ください。</p>
  <div class="nav-pills">
    <a href="/">通信について</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/issues.html">バックナンバー</a>
    <a href="/#contact">お問い合わせ</a>
  </div>

  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script src="/assets/bv-calendar.js"></script>
<script>
document.getElementById('cal').innerHTML = '<p class="lead" id="loading">読み込んでいます…</p>';
fetch('/data/events-public.json', { cache: 'no-cache' })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    // ★先に描く。描けてから一覧を畳む。
    //   逆にすると、mount が落ちたときに「読み込めませんでした」とだけ出て
    //   下の一覧まで消え、ページが完全な行き止まりになる（2026-09-05 に発生）。
    BVCalendar.mount(document.getElementById('cal'), data, {
      // この頁は見出しが h1 だけ（一覧の h2 はJSが動くと隠れる）。月の見出しを h3 に
      // すると h1→h3 の飛びになるので h2 で出す。
      monthLevel: 2,
    });
    if (data && data.events && data.events.length) {
      document.querySelector('.fallback').hidden = true;
    }
  })
  .catch(function (e) {
    // 読み込みに失敗しても一覧は残っている（上で畳んでいないため）
    if (window.console) console.error('カレンダーを描けませんでした:', e);
    var l = document.getElementById('loading');
    if (l) l.textContent = 'カレンダーを読み込めませんでした。下の一覧をご覧ください。';
    var f = document.querySelector('.fallback');
    if (f) f.hidden = false;
  });
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  公開: ${pub.length}件（うち暫定 ${pub.filter((e) => e.tentative).length}件）/ 会期もの ${spans.length}件 / 締切だけ ${deadlineOnly.length}件`);
console.log(`wrote ${OUT_JSON}（★公開される。台帳の内部メモが入っていないことを必ず確認する）`);
