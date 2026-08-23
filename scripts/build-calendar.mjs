#!/usr/bin/env node
/*
 * 公開用のおでかけカレンダーを作る。
 *   node scripts/build-calendar.mjs
 *
 * 入力: data/events.json（全件・非公開）
 * 出力: docs/homepage/calendar.html
 *       docs/homepage/data/events-public.json … ★公開されるので「今日から2週間ぶん」だけ入れる
 *
 * 無料 / サポーターの線引き（docs/freemium-plan.md）:
 *   無料 = 「知る」  … 今日から2週間ぶんのカレンダー。誰でも見られる
 *   有料 = 「決める・動く」… 先の予定まで通して見られる（会員ページ）
 *
 * ここで「無料を薄くする」ことはしない。いままで公開側にカレンダーは1つも無かったので、
 * この2週間ぶんは**無料に足された分**であって、削ったものではない。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN = 'data/events.json';
const OUT = 'docs/homepage/calendar.html';
const OUT_JSON = 'docs/homepage/data/events-public.json';
const PUBLIC_DAYS = 14;
const MEMBER_URL = '/m/s7f2ka/';

const src = JSON.parse(readFileSync(IN, 'utf8'));
// ★「今日」は日本時間で決める。toISOString() は UTC なので、JST の 0〜9時に走ると
//   前日になり、窓が1日前から始まってしまう（Actions のランナーは UTC）。
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const horizon = new Date(Date.parse(today + 'T00:00:00Z') + PUBLIC_DAYS * 86400000)
  .toISOString().slice(0, 10);

// 公開に出すもの: 今日〜2週間のうちに1日でもかかるもの。
// 暫定（日程が未確定）も出す。マス目には置かず「🔎 日程がまだ確定していないもの」に
// 並ぶだけなので、確定情報と混ざらない。
// ★以前は暫定を全部落としていたため、8/29の子連れ◎の花火（昭島くじら祭・武蔵村山）が
//   公開カレンダーから丸ごと消えていた。「載せないより、存在を知らせる」が方針。
const inWindow = (d) => d >= today && d <= horizon;
const pub = src.events
  .filter((e) => (e.dates || []).some(inWindow))
  .map((e) => ({
    ...e,
    dates: e.dates.filter(inWindow),   // 窓の外の日付は公開データに載せない
    source: undefined,
  }));

// 「このあと何件あるか」だけは公開してよい（中身は出さない）。
// 数字だけなので無料版から情報を取り上げることにはならず、先があることは伝わる。
const beyond = src.events.filter(
  (e) => !e.tentative && (e.dates || []).some((d) => d > horizon)
).length;

// 会期もの（「〜10/14まで」）は期間が窓に重なっていれば公開してよい
const spans = src.events.filter((e) => e.span && (!e.span.to || e.span.to >= today));

// 締切が窓の中にあるものは、イベント本体が窓の外でも「名前と締切日だけ」を公開する。
// 無料の役割は「知る」なので、明日締切のものを知らせないのは筋が通らない。
// 日程・場所・料金といった中身は出さない（そこは「決める・動く」＝サポーターの領分）。
const pubIds = new Set(pub.map((e) => e.id));
const deadlineOnly = src.events
  .filter((e) => !e.tentative && e.deadline && e.deadline.date >= today && e.deadline.date <= horizon)
  .filter((e) => !pubIds.has(e.id))
  .map((e) => ({
    id: e.id,
    name: e.name,
    dates: [],                      // マス目には置かない
    // 締切だけ知らせて申し込めないと行き止まりになる。申込先と開催日は通す。
    // 中身（場所・料金・子連れの詳細）は出さない＝そこは「決める・動く」の領分。
    when: e.when,
    url: e.url,
    contact: e.contact,
    deadline: { date: e.deadline.date, raw: e.deadline.raw },
    deadlineOnly: true,
  }));

mkdirSync('docs/homepage/data', { recursive: true });
writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      generated: src.generated,
      window: { from: today, to: horizon },
      events: pub.concat(spans.map((e) => ({ ...e, source: undefined })), deadlineOnly),
      standing: src.standing,
      beyond,
    },
    null,
    1
  )
);

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>おでかけカレンダー｜ぼんぼやーじゅ通信</title>
<meta name="description" content="花小金井・小平まわりの子連れで行けるイベントを、日付が見えるカレンダーで。気になる日をタップして、そのままご自分のカレンダーに保存できます。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/calendar.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/calendar.html">
<meta property="og:title" content="おでかけカレンダー｜ぼんぼやーじゅ通信">
<meta property="og:description" content="花小金井まわりの子連れイベントを、日付から探せるカレンダーに。">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-calendar.css">
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
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>おでかけカレンダー</h1>
    <p class="sub">花小金井・小平まわりの子連れイベントを、日付から。</p>
  </div>
</header>

<main class="wrap">
  <p class="lead">点の日に予定あり。タップでその日の予定が出ます（<b>今日からの2週間ぶん</b>）。</p>

  <noscript>
    <div class="noscript">このカレンダーは表示にJavaScriptを使っています。切っている場合は、下の一覧をご覧ください。</div>
  </noscript>

  <!-- 「読み込んでいます」は JS 側で入れる。noscript のときに残ると案内が二重になる -->
  <div id="cal"></div>

  <!-- JavaScript が動かない環境と、検索エンジン向けの一覧。中身は上のカレンダーと同じ。 -->
  <div class="fallback">
    <h2 class="bvc-tailhead">この2週間の予定（一覧）</h2>
${(() => {
  const byDate = {};
  for (const e of pub) { if (e.tentative) continue; for (const d of e.dates) (byDate[d] ||= []).push(e); }
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
    extra.push('    <h3>申込の締切が近いもの</h3>\n    <ul>' +
      dl.sort((a, b) => a.deadline.date.localeCompare(b.deadline.date)).map((e) =>
        `<li>${esc(e.deadline.date)} まで — ${esc(e.name)}${e.when ? `（開催 ${esc(e.when)}）` : ''}</li>`).join('') +
      '</ul>');
  }
  if (spans.length) {
    extra.push('    <h3>会期中ずっと見られるもの</h3>\n    <ul>' +
      spans.map((e) => `<li>${esc(e.name)}${e.span && e.span.to ? `（${esc(e.span.to)} まで）` : ''}</li>`).join('') +
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
      // ★ローカル時刻のメソッド（getMonth/getDate/getDay）を使ってはいけない。
      //   GitHub Actions のランナーは UTC なので、JST 0:00 が前日15:00になり、
      //   日付と曜日が1日ずれる（JS無効時に出るこの一覧だけが嘘になるので気づきにくい）。
      const [yy, mm, dd] = d.split('-').map(Number);
      const wd = '日月火水木金土'[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
      const label = `${mm}月${dd}日(${wd})`;
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

  <p class="stamp">台帳の更新日: ${esc(src.generated)}　※日程・料金は変わることがあります。おでかけ前に各公式でご確認ください。</p>
  <div class="nav-pills">
    <a href="/">通信について</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/guide.html">おでかけガイド</a>
  </div>

  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">特定商取引法に基づく表記・免責事項</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script src="/assets/bv-calendar.js"></script>
<script>
document.getElementById('cal').innerHTML = '<p class="lead" id="loading">読み込んでいます…</p>';
fetch('/data/events-public.json', { cache: 'no-cache' })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    // 中身があるときだけ一覧を畳む。空の {} を返されたときに
    // 空のカレンダーだけが残って行き止まりになるのを防ぐ。
    if (data && data.events && data.events.length) {
      document.querySelector('.fallback').hidden = true;
    }
    BVCalendar.mount(document.getElementById('cal'), data, {
      teaser: true,
      memberUrl: ${JSON.stringify(MEMBER_URL)},
    });
  })
  .catch(function () {
    // 読み込みに失敗しても一覧が残るので、行き止まりにはならない
    var l = document.getElementById('loading');
    if (l) l.textContent = 'カレンダーを読み込めませんでした。下の一覧をご覧ください。';
  });
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  公開: ${pub.length}件（うち暫定 ${pub.filter((e) => e.tentative).length}件・${today}〜${horizon}）/ 会期もの ${spans.length}件 / 締切だけ ${deadlineOnly.length}件 / この先さらに ${beyond}件`);
console.log(`wrote ${OUT_JSON}（★公開される。2週間ぶんだけ入っていることを必ず確認する）`);
