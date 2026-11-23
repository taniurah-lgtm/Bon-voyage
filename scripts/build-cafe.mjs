#!/usr/bin/env node
/*
 * 「子連れで入りやすいカフェ」のページを組む（ナビは「カフェ情報」）。
 *   node scripts/build-cafe.mjs
 *
 *   data/cafes.json → docs/homepage/cafe.html
 *
 * 2026-11-23 オーナー「カフェも（こだいら幼稚園だよりと）同じテンションで、タブにしませんか。カフェ情報みたいな感じ」
 *   → 幼稚園だよりと同じ形: マス目の「カフェマップ」＋お店ごとのプルダウン。
 *
 * ★書くのは子連れの条件だけ（CLAUDE.md「子連れで入りやすいカフェを載せる」）。
 *   お店のホームページ・Instagram・市の子育てマップに書いてあることだけ。味・雰囲気・「おすすめ」「子連れにやさしい」は書かない。
 *   書いていないことは unsure に入れて「要確認」と出す。
 * ★出すのは pages: true のお店だけ（公式にキッズスペースか子連れ向けの席の記載がある・花小金井から30分）。
 * ★どのお店も同じ形。並びは花小金井駅から近い順（書き手のつながりや協賛で順番を変えない）。
 * ★確かめた日（checked）から60日を過ぎたお店は、組むたびに🔴で知らせる（営業時間・休みが変わりやすい）。
 */
import { navSub } from './lib/nav.mjs';
import { layoutTiles } from './lib/tilemap.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/cafes.json';
const OUT = 'docs/homepage/cafe.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const LINE_URL = 'https://lin.ee/YtcfjnX';
const STALE_DAYS = 60;

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 🔒 公開ページに内部の話を出さない（仕組み・ファイル名・判定理由）
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部|Muse|スクショ/;
// 🔒 個人の連絡先を撒かない（携帯・メール）
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;
// 🔒 評価の言葉を書かない（CLAUDE.md: 味・雰囲気・おすすめは書かない）
const PRAISE = /おすすめ|オススメ|おいしい|美味しい|雰囲気|おしゃれ|子連れにやさしい|ママ向け/;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// 設備のアイコン（2026-11-23 オーナー「キッズスペースありなら、遊びのアイコンみたいな」）
// お店の案内（kids）と、家族で行って確かめたこと（visited・2026-11-23 オーナー）に書いてあるものだけ tags に付ける。線のアイコンを、文字と同じ色で描く
const TAGS = {
  play: { label: 'キッズスペース・おもちゃ', svg: '<path d="M4 21V6M9 21V6M4 6h5M4 10.5h5M4 15h5"/><path d="M9 6c4.5 0 6 3.5 7.5 8S19 21 21 21"/>' },
  seat: { label: '座敷・小上がり・個室', svg: '<rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M12 6v13M3 12.5h9"/>' },
  chair: { label: '子ども用の椅子', svg: '<path d="M8 3v9h9"/><path d="M5 8h10"/><path d="M9 12l-2 9M16 12l2 9M8 17h9"/>' },
  diaper: { label: 'おむつ替え', svg: '<path d="M3 7h18v3.5c0 5-4.5 8.5-9 8.5s-9-3.5-9-8.5z"/><path d="M3 10.5h18M9 19c.5-2.5 1.5-4 3-4s2.5 1.5 3 4"/>' },
  nursing: { label: '授乳スペース', svg: '<path d="M10.5 3h3l.5 3h-4z"/><path d="M9 6h6v2.5H9z"/><path d="M9 8.5h6V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M11 12.5h2M11 15.5h2"/>' },
  menu: { label: '子どもメニュー', svg: '<path d="M6 3v6a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-1.7 0-3 2-3 4.5S15.3 12 17 12s3-2 3-4.5S18.7 3 17 3zM17 12v9"/>' },
  stroller: { label: 'ベビーカーで入れる', svg: '<path d="M3 11h14"/><path d="M10 4a7 7 0 0 1 7 7"/><path d="M10 4v7"/><path d="M17 11l1.5-5H21"/><path d="M5 11c0 3 2 5 5 5h3c2 0 4-2 4-5"/><circle cx="7" cy="19.5" r="1.8"/><circle cx="15" cy="19.5" r="1.8"/>' },
  parking: { label: '駐車場', svg: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3"/>' },
};
const icon = (k, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAGS[k].svg}</svg>`;

const fmtDay = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// ── 検査 ──────────────────────────────────────────────
const problems = [];
const warn = [];
const cafes = (data.cafes || []).filter((c) => c.pages === true);
for (const c of cafes) {
  for (const f of ['id', 'name', 'label', 'area', 'where', 'official', 'mapq', 'checked', 'geo']) if (!c[f]) problems.push(`${c.name || c.id}: ${f} が無い`);
  if (!(c.kids || []).length) problems.push(`${c.name}: kids（お店の案内に書いてある子連れのこと）が無い`);
  if (!(c.tags || []).length) problems.push(`${c.name}: tags（アイコン）が無い。kids に書いてある設備から付ける`);
  for (const t of c.tags || []) if (!TAGS[t]) problems.push(`${c.name}: tags「${t}」は無い（${Object.keys(TAGS).join('／')}）`);
  if (c.geo && (typeof c.geo.lat !== 'number' || typeof c.geo.lon !== 'number')) problems.push(`${c.name}: geo の lat/lon は数で`);
  if (c.checked && daysBetween(c.checked, todayJST) > STALE_DAYS) warn.push(`${c.name}: 確かめてから ${daysBetween(c.checked, todayJST)} 日。営業時間と休みを、お店の発信で見直す`);
  if (c.visited !== undefined && (!Array.isArray(c.visited) || !c.visited.length)) problems.push(`${c.name}: visited（家族で行って確かめたこと）は、文の配列で`);
  const shown = [c.name, c.area, c.where, c.hours, ...(c.kids || []), ...(c.visited || []), ...(c.unsure || []), c.more].filter(Boolean).join(' ');
  const src = shown.match(/（[^）]*(お店の(投稿|案内|Instagram)|公式|ハイライト)[^）]*）/);
  if (src) problems.push(`${c.name}: 出どころの括弧書き「${src[0]}」は書かない（2026-11-23 オーナー）`);
  const m = shown.match(PRAISE);
  if (m) problems.push(`${c.name}: 評価の言葉「${m[0]}」は書かない（子連れの条件だけ）`);
}
if (!cafes.length) problems.push('出せるお店（pages: true）が1軒も無い');
if (problems.length) { console.error('🔴 組めません:\n  ' + problems.join('\n  ')); process.exit(1); }

// 花小金井駅から近い順
const H = data.map.home;
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 90.4);
cafes.sort((a, b) => km(a.geo, H) - km(b.geo, H) || a.name.localeCompare(b.name, 'ja'));

// ── カフェマップ ──────────────────────────────────────
const M = data.map;
const C = M.cols, R = M.rows;
const nodes = [
  ...cafes.map((c) => ({ id: c.id, w: 1, lat: c.geo.lat, lon: c.geo.lon, cafe: c })),
  ...M.stations.map((s, i) => ({ id: `st${i}`, w: M.stationWeight ?? 0.7, lat: s.lat, lon: s.lon, station: s })),
];
// 決まったマス（map.pins: { お店のid か 駅の名前: [列, 段] }・0から数える）
const fixed = {};
for (const [k, [col, row]] of Object.entries(M.pins || {})) {
  const n = nodes.find((x) => x.id === k || x.station?.name === k);
  if (!n) problems.push(`map.pins「${k}」がお店にも駅にも無い`);
  else if (col < 0 || col >= C || row < 0 || row >= R) problems.push(`map.pins「${k}」のマス [${col}, ${row}] が外にある`);
  else fixed[n.id] = row * C + col;
}
const lay = layoutTiles({ cols: C, rows: R, bounds: M.bounds, ys: M.ys ?? 0.9, nodes, fixed });
for (const id of lay.outside) { const n = nodes.find((x) => x.id === id); problems.push(`${n.cafe?.name || n.station.name}: マップの外枠（map.bounds）の外にある`); }
if (lay.tooMany) problems.push(`マスが足りない（${nodes.length} > ${C}×${R}）`);
if (problems.length) { console.error('🔴 組めません:\n  ' + problems.join('\n  ')); process.exit(1); }
const byCell = new Map([...lay.at].map(([id, c]) => [c, nodes.find((n) => n.id === id)]));

// 四角の名前: 「|」の所で2行に。6文字以上は少し小さく
const tileLabel = (s) => s.split('|').map(esc).join('<wbr>');
function tile(n) {
  if (!n) return '<span class="cell" aria-hidden="true"></span>';
  if (n.station) return `<span class="cell st" aria-hidden="true"><span>${esc(n.station.name)}</span></span>`;
  const c = n.cafe;
  const long = c.label.includes('|') ? c.label.split('|').some((x) => x.length >= 5) : c.label.length >= 6;
  const play = (c.tags || []).includes('play');
  return `<a class="cell cf-t${long ? ' long' : ''}" href="#${esc(c.id)}" data-tags="${esc((c.tags || []).join(' '))}" aria-label="${esc(c.name)}の案内を開く${play ? '（キッズスペース・おもちゃあり）' : ''}" data-goatcounter-click="カフェマップ｜${esc(c.name)}"><b>${tileLabel(c.label)}</b>${play ? icon('play', 'tic') : ''}</a>`;
}
const mapHtml = `<div class="emap">
      <div class="nb nb-top"><span>← ${esc(M.neighbors.w)}</span><span>↑ ${esc(M.neighbors.n)}</span><span>${esc(M.neighbors.e)} →</span></div>
      <div class="frame">
        <span class="frame-l">花小金井のまわり</span>
        <div class="grid" style="--cols:${C}">
          ${[...Array(C * R).keys()].map((c) => tile(byCell.get(c))).join('\n          ')}
        </div>
      </div>
      <div class="nb nb-bot"><span>↓ ${esc(M.neighbors.s)}</span></div>
    </div>`;

// ── お店ごと ──────────────────────────────────────────
function cafe(c) {
  const isIg = /instagram\.com\//.test(c.official);
  // アイコンは、どのお店も同じ順（TAGS の順）に並べる
  c = { ...c, tags: Object.keys(TAGS).filter((t) => (c.tags || []).includes(t)) };
  const tags = (c.tags || []).map((t) => `<span class="tg" title="${esc(TAGS[t].label)}">${icon(t)}</span>`).join('');
  return `<details class="cf" id="${esc(c.id)}" data-tags="${esc((c.tags || []).join(' '))}">
      <summary class="cf-h">
        <span class="cf-n"><h2>${esc(c.name)}</h2><span class="area">${esc(c.area)}</span><span class="tgs" role="img" aria-label="${esc((c.tags || []).map((t) => TAGS[t].label).join('、'))}">${tags}</span></span>
        <span class="chev" aria-hidden="true"></span>
      </summary>
      <div class="cf-b">
        <div class="kvs">
          <div class="kv"><span class="k">場所</span><span class="v">${esc(c.where)}</span></div>
          ${c.hours ? `<div class="kv"><span class="k">営業</span><span class="v">${esc(c.hours)}</span></div>` : ''}
        </div>
        <p class="kh">お店の案内にある、子連れのこと</p>
        <ul class="kids">${c.kids.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
        ${(c.visited || []).length ? `<p class="kh">最近、家族で行って確かめたこと</p><ul class="kids">${c.visited.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
        ${c.more ? `<p class="more">${esc(c.more)}</p>` : ''}
        ${(c.unsure || []).length ? `<p class="uns"><b>お店の案内に書いていないこと（要確認）</b>${esc(c.unsure.join('・'))}</p>` : ''}
        <div class="cf-f">
          <span class="chk">${fmtDay(c.checked)}に、お店の案内で確かめました</span>
          <span class="acts">
            <a class="lk" href="${esc(c.official)}" target="_blank" rel="noopener" data-goatcounter-click="${esc('カフェ公式｜' + c.name)}">${isIg ? 'Instagram' : 'お店のページ'}</a>
            <a class="lk" href="${esc(mapUrl(c.mapq || c.name))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('カフェ地図｜' + c.name)}">地図</a>
          </span>
        </div>
      </div>
    </details>`;
}

const n = cafes.length;
const title = '子連れで入りやすいカフェ（花小金井のまわり）';
const desc = `花小金井から30分ほどの、キッズスペースや子ども用の席があるカフェ${n}軒。お店のホームページやInstagramに書いてある子連れのこと（キッズスペース・子ども用の椅子・おむつ替えなど）と、家族で行って確かめたことをまとめています。`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/cafe.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/cafe.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  :root { --map-ground:#F6F2EA; --kid-dot:#C98A3A; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --map-ground:#2A2620; --kid-dot:#F0AE5E; } }
  :root[data-theme="dark"] { --map-ground:#2A2620; --kid-dot:#F0AE5E; }
  main { padding: 1.2rem 0 1rem; }
  .ghead-in { padding-top: 1.4rem; padding-bottom: 1.2rem; }
  .ghead h1 { font-size: clamp(1.45rem, 4.8vw, 2rem); margin-bottom: .35rem; }
  .ghead .sub { font-size: .92rem; line-height: 1.75; }
  .lead { color: var(--ink-soft); font-size: .86rem; line-height: 1.75; margin-bottom: 1rem; }
  .lead b { color: var(--ink); }
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.6rem 0 .6rem; }
  h2.sec:first-child { margin-top: .4rem; }

  /* カフェマップ */
  .emap { margin: 0 0 .5rem; }
  .nb { display: flex; justify-content: space-between; gap: .5rem; font-size: .68rem; color: var(--ink-faint); line-height: 1.4; }
  .nb-top { margin-bottom: .55rem; }
  .nb-bot { justify-content: center; margin-top: .3rem; }
  .frame { position: relative; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--map-ground); padding: .55rem .4rem .45rem; }
  .frame-l { position: absolute; top: -.75em; left: .8rem; background: var(--ground); padding: 0 .4rem; font-family: var(--maru); font-weight: 800; font-size: .76rem; color: var(--ink-soft); line-height: 1.4; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 5px; }
  .cell { min-height: 46px; border-radius: 9px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3px 2px; line-height: 1.2; }
  .cf-t { background: var(--surface); border: 1.5px solid var(--marigold); box-shadow: 0 1px 0 var(--line-strong); text-decoration: none; color: var(--ink); }
  .cf-t:hover, .cf-t:focus-visible { background: var(--marigold-wash); }
  .cf-t b { font-family: var(--maru); font-weight: 800; font-size: clamp(10px, 2.7vw, 14px); letter-spacing: -.02em; word-break: keep-all; }
  .cf-t.long b { font-size: clamp(8.5px, 2.3vw, 13px); letter-spacing: -.04em; }
  .st { border: 1px dashed var(--ink-faint); color: var(--ink-soft); font-size: clamp(8px, 2.1vw, 11px); letter-spacing: -.05em; white-space: nowrap; overflow: hidden; }
  @media (max-width: 340px) { .st { white-space: normal; } }
  .st span::before { content: ""; display: block; width: 1.6em; height: 2px; margin: 0 auto 3px; background: var(--ink-faint); border-radius: 2px; }
  .mapcap { font-size: .78rem; color: var(--ink-soft); line-height: 1.7; margin-top: .45rem; }
  .mapcap b { color: var(--ink); }

  /* お店ごと */
  .cf { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); margin-bottom: .6rem; scroll-margin-top: 96px; }
  .cf-h { display: flex; align-items: center; gap: .6rem; padding: .85rem 1.05rem; cursor: pointer; list-style: none; border-radius: var(--radius-sm); }
  .cf-h::-webkit-details-marker { display: none; }
  .cf-h:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }
  .cf-n { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: .05rem; }
  .cf h2 { font-family: var(--maru); font-weight: 800; font-size: 1.02rem; margin: 0; line-height: 1.45; }
  .area { font-size: .78rem; color: var(--ink-faint); }
  .tgs { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .3rem; }
  .tg { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 8px; background: var(--marigold-wash); color: var(--marigold-ink); }
  .ic { width: 18px; height: 18px; flex: none; }
  .tic { width: 14px; height: 14px; margin-top: 2px; color: var(--marigold-ink); }
  .cf-t.dim { opacity: .28; }
  .filt { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 .8rem; }
  .filt button { font: inherit; display: inline-flex; align-items: center; gap: .3rem; font-size: .76rem; font-weight: 700; min-height: 36px; padding: 0 .7rem; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
  .filt button .ic { width: 16px; height: 16px; color: var(--marigold-ink); }
  .filt button small { font-size: .7rem; color: var(--ink-faint); font-weight: 700; }
  .filt button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }
  .filt button[aria-pressed="true"] .ic, .filt button[aria-pressed="true"] small { color: var(--on-sky); }
  .filt button:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }
  .filt-none { font-size: .86rem; color: var(--ink-soft); margin-bottom: .8rem; }
  .chev { flex: none; width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--line-strong); position: relative; }
  .chev::before { content: ""; position: absolute; left: 50%; top: 45%; width: 8px; height: 8px; border-right: 2px solid var(--ink-soft); border-bottom: 2px solid var(--ink-soft); transform: translate(-50%, -50%) rotate(45deg); transition: transform .15s; }
  .cf[open] .chev::before { transform: translate(-50%, -25%) rotate(-135deg); }
  .cf[open] .cf-h { border-bottom: 1px solid var(--line); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  .cf-b { padding: .8rem 1.05rem .8rem; }
  @media (prefers-reduced-motion: reduce) { .chev::before { transition: none; } }
  .kvs { display: grid; gap: .12rem; margin-bottom: .6rem; }
  .kv { display: flex; gap: .6rem; font-size: .84rem; line-height: 1.6; }
  .kv .k { flex: none; width: 3.2em; color: var(--ink-faint); font-size: .78rem; padding-top: .08rem; }
  .kv .v { min-width: 0; }
  .kh { font-family: var(--maru); font-weight: 800; font-size: .84rem; margin-bottom: .25rem; }
  .kids { list-style: none; margin: 0 0 .55rem; padding: 0; display: grid; gap: .2rem; }
  .kids li { position: relative; padding-left: 1rem; font-size: .88rem; line-height: 1.65; }
  .kids li::before { content: ""; position: absolute; left: .15rem; top: .62em; width: 6px; height: 6px; border-radius: 999px; background: var(--kid-dot); }
  .more { font-size: .82rem; color: var(--ink-soft); background: var(--surface-2); border-radius: 8px; padding: .4rem .65rem; margin-bottom: .45rem; line-height: 1.65; }
  .uns { font-size: .8rem; color: var(--ink-soft); line-height: 1.65; margin-bottom: .2rem; }
  .uns b { display: block; font-size: .74rem; color: var(--ink-faint); font-weight: 700; }
  .cf-f { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .6rem; margin-top: .7rem; padding-top: .5rem; border-top: 1px solid var(--line); }
  .chk { font-size: .72rem; color: var(--ink-faint); line-height: 1.6; }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .75rem; background: var(--surface); white-space: nowrap; }

  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem .9rem; margin-top: 1.2rem; padding: .85rem 1rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); }
  .ask p { flex: 1 1 15rem; font-size: .86rem; line-height: 1.75; color: var(--ink-soft); }
  .ask p b { display: block; font-family: var(--maru); font-weight: 800; color: var(--ink); font-size: .95rem; }
  .ask .lk { flex: none; }
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
      <a class="bvnav-cta" href="${LINE_URL}" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
${navSub('cafe')}
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>子連れで入りやすいカフェ</h1>
    <p class="sub">花小金井から30分ほどの、キッズスペースや子ども用の席があるカフェ${n}軒。お店のホームページやInstagramに書いてある子連れのことと、家族で行って確かめたことをまとめました。</p>
  </div>
</header>

<main class="wrap">
  <h2 class="sec">カフェマップ</h2>
  ${mapHtml}
  <p class="mapcap"><b>お店の四角をタップすると、下の案内が開きます。</b><br>${icon('play', 'tic')} はキッズスペースやおもちゃのあるお店です。</p>

  <h2 class="sec">お店ごとの案内</h2>
  <p class="lead">花小金井駅から近い順です。キッズスペース・子ども用の椅子・おむつ替えなど、お店の案内に書いてあることを載せ、書いていないことは「要確認」としています。家族で行って確かめたことは、分けて書いています。<b>お店の名前をタップすると、くわしい案内が開きます。</b><br>下のボタンで、設備のあるお店だけにしぼれます。</p>
  <div class="filt" role="group" aria-label="設備でしぼる">
    <button type="button" data-f="all" aria-pressed="true">すべて</button>
    ${Object.keys(TAGS).filter((t) => cafes.some((c) => (c.tags || []).includes(t))).map((t) => `<button type="button" data-f="${t}" aria-pressed="false">${icon(t)}${esc(TAGS[t].label)}<small>${cafes.filter((c) => (c.tags || []).includes(t)).length}</small></button>`).join('\n    ')}
  </div>
  <p class="filt-none" id="filt-none" hidden>この設備のお店は、まだありません。</p>
  ${cafes.map(cafe).join('\n  ')}

  <div class="ask">
    <p><b>ご存じのカフェを教えてください</b>子どもと入りやすかったお店があれば、LINEのトークで教えてください。お店の案内を確かめてから載せます。</p>
    <a class="lk" href="${LINE_URL}" target="_blank" rel="noopener" data-goatcounter-click="カフェ｜教えて">LINEで教える</a>
  </div>

  <p class="about">お店のホームページ・Instagramを、お店ごとに確かめた日を書いています。営業日や休みは変わることがあるので、出かける前にお店の案内でご確認ください。<br>
  内容の誤りに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/entei.html">こだいら幼稚園だより</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
  </div>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script>
/* 設備でしぼる: 合わないお店のプルダウンを隠し、マップの四角を薄くする */
(function () {
  var btns = [].slice.call(document.querySelectorAll('.filt button'));
  var cards = [].slice.call(document.querySelectorAll('details.cf'));
  var tiles = [].slice.call(document.querySelectorAll('.cf-t'));
  function has(el, f) { return f === 'all' || (' ' + (el.getAttribute('data-tags') || '') + ' ').indexOf(' ' + f + ' ') >= 0; }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-f'), n = 0;
      btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      cards.forEach(function (c) { var on = has(c, f); c.hidden = !on; if (on) n++; });
      tiles.forEach(function (t) { t.classList.toggle('dim', !has(t, f)); });
      document.getElementById('filt-none').hidden = n > 0;
    });
  });
})();
/* お店ごと: 名前をタップで開く。マップの四角から来たときは、そのお店を開いておく */
(function () {
  function openTo(id) {
    var el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) openTo(decodeURIComponent(a.getAttribute('href').slice(1)));
  });
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

writeFileSync(OUT, html);
console.log(`wrote ${OUT}（${n}軒 / 近い順: ${cafes.map((c) => c.label.replace('|', '')).join('・')}）`);
for (let r = 0; r < R; r++) {
  console.log('  ' + [...Array(C).keys()].map((c) => { const x = byCell.get(r * C + c); return (x ? (x.cafe ? x.cafe.label.replace('|', '') : '🚉' + x.station.name.replace('駅', '')) : '・').padEnd(6, '　'); }).join(''));
}
for (const w of warn) console.log('  🔴 ' + w);
