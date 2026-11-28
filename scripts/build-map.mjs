#!/usr/bin/env node
/*
 * みんなのおでかけマップを生成する。
 *   MAP_POST_URL=https://script.google.com/macros/s/.../exec GMAPS_KEY=... node scripts/build-map.mjs
 *
 * 入力:
 *   data/map-spots.json … ぼんぼやーじゅが選んだスポット。lat/lng は scripts/geocode-spots.mjs が入れる
 *                         months（例 [6,7,8,9]）があるものは、その月だけ出す（夏だけの水あそび）
 *   data/cafes.json     … 子連れで入りやすいカフェ（pages:true のものだけ＝カフェのページと同じ）
 *   docs/homepage/data/events-public.json … これからの催し（3週間）。カレンダーと同じ公開データ（build-calendar.mjs が先に作る）
 *                         位置は data/event-geo.json（scripts/geocode-events.mjs）。協賛かどうかだけ data/events.json から
 *   data/map-posts.json … 承認済みのみんなの投稿
 *   data/map-pr.json    … 協賛（紹介型）の催しの位置。番地を公開している所だけ
 *   data/teirei.json    … 児童館などの、おたよりと定例の日程へのリンク
 * 出力:
 *   docs/homepage/map.html
 *
 * 🆕 2026-11-28 作り直し（オーナー「寒い季節なのにじゃぶじゃぶ池。カフェ情報が全部プロットされていない。見づらい」）:
 *   - 地図を先に。種類は8つの短い言葉（＋年齢・雨でもOK）。ピンは種類の絵の丸、重なれば数の丸
 *   - 夏だけの水あそびは、季節の外では出さない（下に「いまは出していません」と書く）
 *   - カフェはカフェのページと同じ14軒を、そのまま出す（マップ側の8軒の写しはやめた）
 *   - これからの催し（3週間・位置が決まったもの）も、日付つきのピンにする
 *   - 地図の下は、しぼった中身を花小金井駅から近い順に（大きなカードを全部並べるのはやめた）
 *   一覧の id は、これまでと同じ spotSlug(名前)。定例のページから /map.html#s-… で飛んでくる
 */
import { navSub } from './lib/nav.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { jsonInTag, esc } from './lib/gate.mjs';
import { publicUrl } from './lib/city-site.mjs';
import { spotSlug } from './lib/spot-slug.mjs';

const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const TODAY = process.env.BV_TODAY || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const MONTH = +TODAY.slice(5, 7);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const UNTIL = addDays(TODAY, 21);
const OUT = 'docs/homepage/map.html';
const TEXT_LIMIT = 300;
const POST_URL = process.env.MAP_POST_URL || '';
// Googleマップの下地。鍵は GitHub の Variables の GMAPS_KEY（deploy-homepage.yml の「マップを組む」で入る）。
// このホームページからしか使えない鍵（リファラー制限）。無いとき（手元）は OpenStreetMap。手順は docs/gmaps-key.md
const GMAPS_KEY = (process.env.GMAPS_KEY || '').trim();
if (GMAPS_KEY && !/^[A-Za-z0-9_-]{20,60}$/.test(GMAPS_KEY)) { console.error('🔴 GMAPS_KEY の形が違う（APIキーは英数字と - _ だけ）'); process.exit(1); }
const mapQ = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const problems = [];

// ---- 種類（地図の上のボタン）。言葉は短く、絵と色で見分ける ---------------------------
const GROUPS = [
  { key: 'event', icon: '📅', label: 'これからの催し', chip: '催し', color: '#C2410C' },
  { key: 'park', icon: '🌳', label: '公園', chip: '公園', color: '#2F7D3A' },
  { key: 'jidokan', icon: '🏠', label: '児童館・こども広場', chip: '児童館', color: '#BE185D' },
  { key: 'library', icon: '📚', label: '図書館', chip: '図書館', color: '#2563EB' },
  { key: 'indoor', icon: '🧸', label: '室内あそび', chip: '室内', color: '#7C3AED' },
  { key: 'cafe', icon: '☕', label: '子連れで入りやすいカフェ', chip: 'カフェ', color: '#8A5A12' },
  { key: 'train', icon: '🚃', label: '電車でおでかけ', chip: '電車で', color: '#0F766E' },
  { key: 'water', icon: '💧', label: '水あそび・プール', chip: '水あそび', color: '#0E7490' },
];
// 動物は公園に、ものづくりは室内に。夏（6〜9月）のほかは、水あそびの種類を出さない
//（夏だけの所は外し、屋内ドームのプールは「室内」に入れる）
const SUMMER = [6, 7, 8, 9].includes(MONTH);
const CAT2G = [['🌳', 'park'], ['🦒', 'park'], ['💧', 'water'], ['🏊', 'water'], ['☔', 'indoor'], ['🎨', 'indoor'], ['🚃', 'train'], ['🏠', 'jidokan'], ['📚', 'library'], ['☕', 'cafe']];
const groupOf = (cat) => (CAT2G.find(([p]) => cat.startsWith(p)) || [])[1];

// ---- 開いている曜日（「月〜土曜 10:00〜18:00」「水曜と第1日曜 10:00〜18:00」）と、カフェの定休日 -----------------
const DOW = '日月火水木金土';
const dowRange = (a, b) => { const out = []; let i = DOW.indexOf(a); const j = DOW.indexOf(b || a); for (;;) { out.push(i); if (i === j) break; i = (i + 1) % 7; } return out; };
function openOf(access) {
  for (const seg of String(access || '').split('／')) {
    const m = seg.match(/^([月火水木金土日])(?:〜([月火水木金土日]))?曜(?:と第(\d)([月火水木金土日])曜)?\s*(\d{1,2}:\d{2}〜\d{1,2}:\d{2})/);
    if (m) return { dows: dowRange(m[1], m[2]), nth: m[3] ? [[DOW.indexOf(m[4]), +m[3]]] : [], time: m[5], hol: /祝[^）]*休/.test(seg) };
  }
  return null;
}
function closedOf(hours) {
  const h = String(hours || ''), out = new Set();
  for (const m of h.matchAll(/([月火水木金土日])曜(?:日)?定休/g)) out.add(DOW.indexOf(m[1]));
  for (const m of h.matchAll(/((?:[月火水木金土日]曜(?:日)?[・と])*[月火水木金土日]曜(?:日)?)(?:・祝日)?は(?:お)?休み/g))
    for (const d of m[1].match(/[月火水木金土日](?=曜)/g)) out.add(DOW.indexOf(d));
  // 「火・水・金・土・日の11:00〜」「冬は水・土・日の12:00〜」＝書いていない曜日は休み
  const only = h.match(/^(?:冬は)?((?:[月火水木金土日]・)+[月火水木金土日])の\d/);
  if (only) { const on = only[1].split('・').map((d) => DOW.indexOf(d)); for (let i = 0; i < 7; i++) if (!on.includes(i)) out.add(i); }
  return out.size ? { dows: [...out].sort(), hol: /祝日[^。]*休/.test(h) } : null;
}
// 定例（児童館・図書館・ひろば）の、これからの日程（30日先まで）
function teireiNext(place) {
  const out = [], until = addDays(TODAY, 30);
  for (const pr of place.programs || []) for (const d of pr.dates || []) {
    const iso = typeof d === 'string' ? d : d.d;
    if (!iso || iso < TODAY || iso > until) continue;
    const dow = DOW[new Date(iso + 'T00:00:00Z').getUTCDay()];
    const time = (pr.timeByDow && pr.timeByDow[dow]) || (pr.time && !/[／]/.test(pr.time) ? pr.time.replace(/（.*$/, '') : '');
    out.push({ d: iso, t: (typeof d === 'object' && d.t ? d.t.replace(/\s.*$/, '') : pr.title).replace(/（.*$/, ''), time });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d)).slice(0, 4);
}
const AGE_KEYS = { '👶': 'baby', '🧒': 'pre', '🎒': 'elem' };
function parseAges(s) {
  const o = {};
  for (const m of String(s || '').matchAll(/(👶|🧒|🎒)\s*([◎○△✕×])/g)) o[AGE_KEYS[m[1]]] = m[2];
  return Object.keys(o).length ? o : null;
}
const INDOOR_RE = /(屋内|室内|全天候|ドーム|アリーナ|ミュージアム)/;

// ---- 投稿・おたより・定例 ---------------------------------------------------------
const TEIREI = new Map();
for (const sec of read('data/teirei.json', { sections: [] }).sections)
  for (const p of sec.places)
    for (const name of p.spots || []) TEIREI.set(name, { otayori: p.otayori || null, teirei: `/teirei.html#${p.key}`, next: teireiNext(p) });
const POSTS = read('data/map-posts.json', []);
const bySpot = new Map();
for (const p of POSTS) { if (!bySpot.has(p.spot)) bySpot.set(p.spot, []); bySpot.get(p.spot).push(p); }
for (const l of bySpot.values()) l.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const voices = (name) => (bySpot.get(name) || []).map((p) => ({ text: p.text, who: p.who || '', date: p.date || '' }));

// ---- スポット --------------------------------------------------------------------
const RAW = read('data/map-spots.json', []);
for (const name of TEIREI.keys()) if (!RAW.some((s) => s.name === name)) problems.push(`定例の spots「${name}」がマップに無い（名前の書き方を合わせる）`);
const offSeason = [];
const spotItems = [];
for (const s of RAW) {
  let g = groupOf(s.cat);
  if (g === 'water' && !SUMMER && !s.months) g = 'indoor';   // 屋内ドームのプール（サマーランド）は、冬は「室内」に
  if (!g) { problems.push(`スポット「${s.name}」の種類「${s.cat}」が、どの種類にも当たらない`); continue; }
  if (g === 'cafe') continue;                                   // カフェは data/cafes.json から（下）
  if (s.geoSkip || typeof s.lat !== 'number') continue;          // 行き先ではないもの（「新宿・都心方面へ一本」）
  if (Array.isArray(s.months) && !s.months.includes(MONTH)) { offSeason.push(s); continue; }
  const t = TEIREI.get(s.name) || {};
  const ages = parseAges(s.ages);
  if (!ages) problems.push(`スポット「${s.name}」に年齢の目安（👶 ○ 🧒 ◎ 🎒 ◎）が無い`);
  spotItems.push({
    id: spotSlug(s.name), k: 'spot', g, name: s.name, lat: s.lat, lng: s.lng,
    acc: s.access || '', desc: s.desc || '', ages,
    indoor: g === 'indoor' || g === 'jidokan' || g === 'library' || (INDOOR_RE.test(`${s.name} ${s.desc}`) && g !== 'park'),
    map: s.map || mapQ(s.name), off: publicUrl(s.official) || '',
    otayori: t.otayori || null, teirei: t.teirei || '',
    reader: s.fromReader || '', voices: voices(s.name),
    season: s.seasonNote || '', approx: s.geoSource === 'manual-approx',
    open: s.open || openOf(s.access), next: t.next && t.next.length ? t.next : undefined, added: s.added || '',
  });
}
// 「雨でもOK」: 室内あそび・児童館・図書館・カフェと、説明に屋内とあるもの。公園は「ふわふわドーム」などがあっても入れない

// 同じ建物の「〇〇児童館」と「〇〇児童館 こども広場」は1件にする（地図で同じ場所に2つ並ぶと、押しても割れない）。
// こども広場の時間は説明に足す。こども広場の id（定例のページや古いリンク）は alias で同じ1件に着く
const RANK = '✕△○◎';
for (const hub of spotItems.slice()) {
  const sub = spotItems.find((x) => x !== hub && x.name === `${hub.name} こども広場` && Math.abs(x.lat - hub.lat) < 1e-4 && Math.abs(x.lng - hub.lng) < 1e-4);
  if (!sub) continue;
  hub.name = `${hub.name}・こども広場`;
  hub.desc += ` 館内の「こども広場」は、乳幼児と保護者・小中学生向けの別のスペースで、${sub.open ? sub.open.time : ''}（児童館とは別の時間）。子育ての相談もできます。`;
  if (hub.ages && sub.ages) for (const k of ['baby', 'pre', 'elem']) if (RANK.indexOf(sub.ages[k]) > RANK.indexOf(hub.ages[k])) hub.ages[k] = sub.ages[k];
  hub.voices = hub.voices.concat(sub.voices);
  hub.alias = [sub.id];
  spotItems.splice(spotItems.indexOf(sub), 1);
}

// 最新の号（LINEで送った号＝sent.log）の年齢別ページに載っている催しは、そのページへつなぐ
const SENT = existsSync('reports/free/sent.log') ? readFileSync('reports/free/sent.log', 'utf8').trim().split('\n').map((l) => l.split('\t')[0]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= TODAY) : [];
const ISSUE = SENT.length ? SENT[SENT.length - 1] : '';
const ISSUE_CAFES = new Set(ISSUE && existsSync(`reports/free/web/${ISSUE}.json`) ? (read(`reports/free/web/${ISSUE}.json`, {}).cafes || []) : []);
const ISSUE_IDS = new Set(ISSUE && existsSync(`reports/free/web/${ISSUE}.json`) ? (read(`reports/free/web/${ISSUE}.json`, {}).items || []).map((x) => x.id) : []);
const weekTab = (ages) => { if (!ages) return 'pre'; for (const k of ['pre', 'baby', 'elem']) if (ages[k] === '◎') return k; for (const k of ['pre', 'baby', 'elem']) if (ages[k] === '○') return k; return 'pre'; };
// ---- カフェ（カフェのページと同じ pages:true だけ） ---------------------------------
const CAFE = read('data/cafes.json', { cafes: [] });
const TAG = { play: 'キッズスペース・おもちゃ', seat: '座敷・小上がり・個室', chair: '子ども用の椅子', diaper: 'おむつ替え', nursing: '授乳スペース', menu: '子どもメニュー', stroller: 'ベビーカーで入れる', parking: '駐車場' };
const cafeSpot = new Map(RAW.filter((s) => groupOf(s.cat) === 'cafe').map((s) => [s.name, s]));
const cafeItems = [];
for (const c of (CAFE.cafes || []).filter((c) => c.pages === true)) {
  if (!c.geo || typeof c.geo.lat !== 'number') { problems.push(`カフェ「${c.name}」に位置（geo）が無い`); continue; }
  const old = cafeSpot.get(c.name);
  cafeItems.push({
    id: old ? spotSlug(c.name) : `cafe-${c.id}`, k: 'cafe', g: 'cafe', name: c.name, lat: c.geo.lat, lng: c.geo.lon,
    acc: c.area || '', tags: (c.tags || []).map((t) => TAG[t]).filter(Boolean),
    hours: c.hours || '', visited: c.visited || [],
    indoor: true, map: mapQ(c.mapq || c.name), off: c.official || '', more: `/cafe.html#${c.id}`,
    reader: old && old.fromReader ? old.fromReader : '', voices: voices(c.name),
    closed: closedOf(c.hours), added: c.added || '',
    week: ISSUE_CAFES.has(c.id) ? `/week/${ISSUE}/pre/` : '',
  });
}
for (const name of cafeSpot.keys()) if (!cafeItems.some((c) => c.name === name)) problems.push(`マップの☕「${name}」が、カフェのページ（data/cafes.json の pages:true）に無い。名前を合わせるか、マップから外す`);

// ---- これからの催し（3週間） ---------------------------------------------------------
// 🔒 中身は公開用のデータ（docs/homepage/data/events-public.json＝カレンダーと同じ）からだけ取る。
//    data/events.json は公開しない全件版（連絡先・確度・出典などを持つ）。そこからは「協賛（PR）か」と「状態」だけを見る
const PUB = read('docs/homepage/data/events-public.json', { events: [] }).events;
const INNER = new Map(read('data/events.json', { events: [] }).events.map((e) => [e.id, e]));
const EVENTS = PUB.map((e) => ({ ...e, pr: (INNER.get(e.id) || {}).pr || '', status: (INNER.get(e.id) || {}).status || '' }));
const GEO = read('data/event-geo.json', {});
const PR_POS = read('data/map-pr.json', {});
for (const id of Object.keys(PR_POS)) if (!/^E\d+$/.test(id)) problems.push(`data/map-pr.json の「${id}」は台帳のIDの形になっていない`);
const lastDay = (e) => (e.span && e.span.to) || (e.dates && e.dates.length ? e.dates[e.dates.length - 1] : '') || '';
const EV_INDOOR = /(科学館|図書館|児童館|公民館|ホール|下水道館|地域センター|生涯学習センター|交流館|ルミエール|まろにえ|ハウジングステージ|おふろ)/;
// 日時の欄の頭の日付（カードでは別に「11/29(日)」と出すので、二重にしない）。時刻などが残らなければ空
function whenRest(w) {
  let r = String(w || ''), prev;
  do { prev = r; r = r.replace(/^[\s・、〜～]*(?:\d{4}年)?(?:\d{1,2}[\/月])?\d{1,2}日?\s*[(（][^)）]{1,8}[)）]/, ''); } while (r !== prev);
  r = r.replace(/^[\s・、。,]+/, '');
  if (!r) return '';
  return /^[〜～]?\s*\d{1,2}:\d{2}/.test(r) || /^[^\d]/.test(r) ? r.replace(/^[〜～]\s*(?=\d{1,2}:)/, '') : String(w || '');
}
const evItems = [];
let evNoPos = 0;
for (const e of EVENTS) {
  if (e.status && /終了|見送り|中止/.test(e.status)) continue;
  const future = (e.dates || []).filter((d) => d >= TODAY && d <= UNTIL);
  const spanOn = e.span && e.span.from && e.span.to && e.span.from <= UNTIL && e.span.to >= TODAY;
  if (!future.length && !spanOn) continue;
  // 協賛（紹介型）の催しは、番地を公開している所（map-pr.json）にだけピンを立てる
  const pos = e.pr ? PR_POS[e.id] : GEO[e.id];
  if (!pos || typeof pos.lat !== 'number') { evNoPos++; continue; }
  const ages = e.ages && (e.ages.baby || e.ages.pre || e.ages.elem) ? { baby: e.ages.baby || '', pre: e.ages.pre || '', elem: e.ages.elem || '' } : null;
  evItems.push({
    id: 'ev-' + Buffer.from(e.id).toString('hex'), k: 'event', g: 'event', name: e.name, lat: pos.lat, lng: pos.lng,
    dates: future, span: spanOn ? { from: e.span.from, to: e.span.to } : null, last: lastDay(e),
    when: whenRest(e.when), place: e.place || '', desc: e.summary || '', note: e.kidsNote || '', ages, cost: e.cost || '',
    week: ISSUE_IDS.has(e.id) ? `/week/${ISSUE}/${weekTab(ages)}/` : '',
    indoor: EV_INDOOR.test(e.place || '') && !/(公園|広場|屋外|園庭)/.test(e.place || ''),
    off: e.url || '', map: mapQ(e.mapq || e.place || e.name), pr: e.pr || '',
  });
}

const ITEMS = [...evItems, ...spotItems, ...cafeItems];
const ids = new Set();
for (const it of ITEMS) { if (ids.has(it.id)) problems.push(`id がぶつかった: ${it.name}`); ids.add(it.id); }
const used = GROUPS.filter((g) => ITEMS.some((it) => it.g === g.key));
const nSpot = spotItems.length, nCafe = cafeItems.length, nEv = evItems.length;

if (problems.length) { for (const p of problems) console.error('🔴 ' + p); process.exit(1); }

// ---- ページ ----------------------------------------------------------------------
const chips = [`<button type="button" class="om-chip" data-g="" aria-pressed="true"><span class="l">すべて</span><span class="c">${ITEMS.length}</span></button>`]
  .concat(used.map((g) => `<button type="button" class="om-chip" data-g="${g.key}" aria-pressed="false" style="--c:${g.color}"><span class="l"><span aria-hidden="true">${g.icon}</span>${esc(g.chip)}</span><span class="c">0</span></button>`))
  .join('');
const seasonNote = offSeason.length
  ? `<p class="om-season">❄️ いまの季節は、夏だけの水あそび（${offSeason.map((s) => esc(s.name.replace(/\s*噴水広場$/, 'の噴水').replace(/公園$/, '公園のじゃぶじゃぶ池'))).join('・')}）を地図から外しています。例年、夏になったら戻します。</p>`
  : '';
// この1週間で足した場所（一覧の上に1行。毎週の「ふえた」が分かるように）
const NEWLY = [...spotItems, ...cafeItems].filter((x) => x.added && x.added <= TODAY && x.added >= addDays(TODAY, -7));
const newLine = (() => {
  if (!NEWLY.length) return '';
  const libs = NEWLY.filter((x) => x.g === 'library').length;
  const names = (libs >= 3 ? [`図書館${libs}館`] : []).concat(NEWLY.filter((x) => !(libs >= 3 && x.g === 'library')).map((x) => { const q = x.name.match(/「(.+?)」/); return q ? q[1] : x.name.replace(/[（(].*$/, ''); }));
  return `<p class="om-newline"><b>🆕 この1週間で${NEWLY.length}か所</b>${esc(names.slice(0, 4).join('・'))}${names.length > 4 ? ' ほか' : ''}</p>`;
})();
// スポット名（投稿フォームの候補）
const postSpots = [...spotItems, ...cafeItems].map((s) => ({ name: s.name }));

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>みんなのおでかけマップ｜ぼんぼやーじゅ通信</title>
<meta name="description" content="小平・花小金井のまわりの、公園・児童館・室内あそび・子連れで入りやすいカフェ、これからの親子の催しを地図に。花小金井駅から近い順に探せます。">
<link rel="canonical" href="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/map.html">
<meta property="og:title" content="みんなのおでかけマップ｜ぼんぼやーじゅ通信">
<meta property="og:description" content="公園・児童館・室内あそび・子連れで入りやすいカフェ・これからの催しを、1枚の地図に。">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/leaflet/leaflet.css">
<link rel="stylesheet" href="/assets/bv-post.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<style>
  .om-head { padding: .7rem 0 0; }
  .om-head h1 { font-size: clamp(1.2rem, 4.6vw, 1.7rem); margin: 0 0 .1rem; line-height: 1.3; }
  .om-lead { margin: 0; font-size: .8rem; color: var(--ink-soft); line-height: 1.5; }
  .om-lead b { color: var(--ink); }

  /* 種類のボタン。折り返して全部見せる（横に流すと、右のほうがあることに気づかない） */
  /* 4つずつ2段。横に流すと、右のほうがあることに気づかない */
  .om-chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; margin: .55rem 0 .35rem; }
  @media (min-width: 720px) { .om-chips { grid-template-columns: repeat(8, auto); justify-content: start; } }
  /* 名前と件数を2行に（狭い画面でも切れない） */
  .om-chip { --c: var(--sky-deep); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; min-height: 44px; min-width: 0; padding: .15rem .1rem; white-space: nowrap; overflow: hidden;
    font: 700 .8rem/1.1 var(--body); color: var(--ink); background: var(--surface); border: 1.5px solid var(--line-strong); border-radius: 999px; cursor: pointer; }
  .om-chip .l { display: block; line-height: 1.2; }
  .om-chip .c { display: block; font-weight: 700; font-size: .66rem; line-height: 1.1; color: var(--ink-soft); }
  .om-chip .c::after { content: "件"; }
  .om-chip[aria-pressed="true"] { background: var(--c); border-color: var(--c); color: #fff; }
  .om-chip[data-g=""][aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--ground); }
  .om-chip[aria-pressed="true"] .c { color: inherit; opacity: .9; }
  .om-chip:disabled { opacity: .4; cursor: default; }
  .om-chip:focus-visible, .om-age button:focus-visible, .om-rain:focus-visible, .om-ctl button:focus-visible, .om-row:focus-visible { outline: 3px solid var(--sky); outline-offset: 2px; }

  .om-filters { display: flex; margin: 0 0 .3rem; }
  .om-toggles { display: grid; grid-template-columns: 1fr 1fr; gap: .3rem; margin: 0 0 .5rem; }
  .om-age { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); flex: 1 1 auto; min-width: 0; border: 1.5px solid var(--line-strong); border-radius: 999px; overflow: hidden; background: var(--surface); }
  .om-age button { min-width: 0; min-height: 44px; padding: .2rem .3rem; border: 0; background: none; font: 700 .74rem/1.15 var(--body); color: var(--ink-soft); cursor: pointer; white-space: nowrap; }
  .om-age button + button { border-left: 1px solid var(--line); }
  .om-age button[aria-pressed="true"] { background: var(--sky-deep); color: var(--on-sky); }
  .om-rain { min-height: 44px; padding: .2rem .5rem; white-space: nowrap; border: 1.5px solid var(--line-strong); border-radius: 999px; background: var(--surface);
    font: 700 .74rem/1.15 var(--body); color: var(--ink-soft); cursor: pointer; }
  .om-rain[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }

  /* 地図 */
  .om-stage { position: relative; }
  #om-map { scroll-margin-top: 108px; height: min(56vh, 520px); min-height: 320px; border-radius: 16px; border: 1px solid var(--line-strong); background: var(--surface-2); overflow: hidden; z-index: 0; }
  .om-ctl { position: absolute; top: 8px; left: 8px; right: 8px; z-index: 500; display: flex; flex-wrap: nowrap; gap: .3rem; pointer-events: none; }
  .om-ctl button { pointer-events: auto; min-height: 44px; padding: .2rem .7rem; font: 700 .78rem/1.15 var(--body); white-space: nowrap; color: #1d2a31; background: rgba(255,255,255,.96);
    border: 1px solid rgba(0,0,0,.15); border-radius: 999px; box-shadow: 0 1px 5px rgba(0,0,0,.18); cursor: pointer; }
  .om-fail { padding: 1.2rem; font-size: .9rem; color: var(--ink-soft); }

  .om-pin-w { background: none; border: 0; }
  .om-pin { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; margin: 2px; border-radius: 50%; font-size: 15px; line-height: 1;
    background: #fff; border: 3px solid var(--c); box-shadow: 0 1px 4px rgba(0,0,0,.35); cursor: pointer; transition: transform .12s; }
  .om-pin.on { transform: scale(1.3); box-shadow: 0 0 0 4px rgba(255,255,255,.9), 0 2px 8px rgba(0,0,0,.45); }
  .om-pin.off, .om-ev.off { opacity: .5; filter: grayscale(.6); }
  .om-ev.soon { outline: 3px solid #FDE68A; }
  .om-nm { position: absolute; left: 38px; top: 9px; white-space: nowrap; font: 800 11px/1 var(--body); font-style: normal; color: #1d2a31;
    background: rgba(255,255,255,.92); padding: 3px 5px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.2); pointer-events: none; }
  .om-ev + .om-nm { left: 56px; top: 8px; }
  .om-tip { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 700; padding: .6rem 1rem; border-radius: 12px;
    background: rgba(20,28,33,.82); color: #fff; font: 800 .9rem/1.3 var(--body); pointer-events: none; }
  .om-tip[hidden] { display: none; }
  .om-out { position: absolute; left: 10px; bottom: 34px; z-index: 500; font: 700 .74rem/1.2 var(--body); color: #1d2a31; background: rgba(255,255,255,.92);
    border-radius: 999px; padding: .3rem .6rem; box-shadow: 0 1px 4px rgba(0,0,0,.18); pointer-events: none; }
  .om-out[hidden] { display: none; }
  .om-hint { position: absolute; left: 50%; top: 58px; transform: translateX(-50%); z-index: 500; white-space: nowrap; font: 700 .74rem/1.2 var(--body); color: #fff;
    background: rgba(20,28,33,.78); border-radius: 999px; padding: .35rem .7rem; pointer-events: none; transition: opacity .3s; }
  .om-hint.gone { opacity: 0; }
  .om-ev { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 28px; min-width: 50px; margin: 2px; padding: 0 5px;
    border-radius: 8px; background: var(--c); color: #fff; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: pointer; white-space: nowrap; }
  .om-ev b { font: 800 12px/1 var(--body); }
  .om-ev::before { content: "📅"; font-size: 10px; line-height: 1; margin-bottom: 1px; display: none; }
  .om-ev.pr { background: #5E5148; }
  .om-ev.on { transform: scale(1.2); box-shadow: 0 0 0 3px rgba(255,255,255,.9), 0 2px 8px rgba(0,0,0,.45); }
  .om-cl { display: flex; width: max-content; align-items: center; justify-content: center; gap: 2px; height: 30px; min-width: 44px; margin: 1px auto; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #1d2a31; color: #fff;
    font: 800 13px/1 var(--body); border: 2px solid #fff; box-shadow: 0 1px 5px rgba(0,0,0,.4); cursor: pointer; white-space: nowrap; }
  .om-cl i { font-style: normal; font-size: 13px; letter-spacing: -1px; }
  .om-home { background: none; border: 0; }
  .om-home i { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: #E0393E; border: 3px solid #fff; box-shadow: 0 0 0 2px rgba(224,57,62,.35); }
  .om-home span { position: absolute; left: 10px; top: -10px; white-space: nowrap; font: 800 11px/1 var(--body); color: #1d2a31; background: rgba(255,255,255,.92); padding: 3px 5px; border-radius: 6px; }

  /* カード（ピンを押したとき）。広い画面は地図の左下に重ね、スマホは画面の下から */
  /* 広い画面は地図の右上に重ねる（左下の Google のロゴを隠さない）。スマホは画面の下から */
  .om-card { position: absolute; right: 10px; top: 54px; z-index: 600; width: min(370px, calc(100% - 20px)); max-height: calc(100% - 140px); overflow: auto;
    background: var(--surface); color: var(--ink); border-radius: 14px; box-shadow: 0 6px 28px rgba(0,0,0,.28); border: 1px solid var(--line-strong); }
  .om-card[hidden] { display: none; }
  @media (max-width: 720px) {
    /* カードを開いても、地図の全体（下の端のロゴまで）がカードの上に見える高さ。上のナビ（約100px）とカード（40vh）を引いた残り */
    #om-map { height: max(280px, calc(60vh - 106px)); min-height: 0; }
    .om-card { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 40vh; border-radius: 16px 16px 0 0; border-bottom: 0;
      padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -4px 24px rgba(0,0,0,.25); }
  }
  .om-ch { position: sticky; top: 0; display: flex; align-items: flex-start; gap: .6rem; padding: .8rem .8rem .55rem .9rem; background: var(--surface); border-bottom: 1px solid var(--line); }
  .om-ci { --c: var(--sky-deep); flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%;
    background: var(--surface); border: 3px solid var(--c); font-size: 17px; line-height: 1; }
  .om-ci.sm { width: 28px; height: 28px; font-size: 14px; border-width: 2px; }
  .om-cn { flex: 1 1 auto; min-width: 0; }
  .om-cn b { display: block; font-family: var(--maru); font-weight: 800; font-size: 1.02rem; line-height: 1.35; }
  .om-cm { display: block; font-size: .76rem; color: var(--ink-soft); margin-top: .1rem; }
  .om-x { flex: 0 0 auto; width: 44px; height: 44px; margin: -6px -4px 0 0; border: 0; border-radius: 50%; background: var(--surface-2); color: var(--ink); font-size: 1.3rem; line-height: 1; cursor: pointer; }
  .om-cb { padding: .6rem .9rem .9rem; font-size: .9rem; line-height: 1.65; }
  .om-cb p { margin: 0 0 .45rem; }
  .om-when b { color: #B33A0B; }
  .om-acc { color: var(--sky-deep); font-weight: 700; font-size: .84rem; }
  .om-desc { color: var(--ink-soft); }
  .om-note { font-size: .84rem; background: var(--surface-2); border-radius: 10px; padding: .45rem .65rem; }
  .om-cost, .om-prn, .om-approx { font-size: .8rem; color: var(--ink-soft); }
  .om-season-tag { display: inline-block; font-size: .78rem; font-weight: 700; color: var(--marigold-ink); background: var(--marigold-wash); border-radius: 999px; padding: .1rem .6rem; }
  .om-tags { list-style: none; display: flex; flex-wrap: wrap; gap: .3rem; padding: 0; margin: 0 0 .5rem; }
  .om-tags li { font-size: .76rem; font-weight: 700; color: var(--ink); background: var(--surface-2); border: 1px solid var(--line-strong); border-radius: 999px; padding: .12rem .55rem; }
  .om-kids { margin: 0 0 .5rem; padding-left: 1.1rem; font-size: .84rem; color: var(--ink-soft); }
  .om-reader { margin: .2rem 0 .55rem; padding: .5rem .7rem; background: var(--sky-wash); border-left: 3px solid var(--sky-deep); border-radius: 0 10px 10px 0; font-size: .86rem; }
  .om-reader b { display: block; font-size: .74rem; color: var(--sky-deep); margin-bottom: .15rem; }
  .om-ages { display: flex; gap: .3rem; margin: .1rem 0 .6rem; }
  .om-age-c { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; padding: .3rem .2rem; border-radius: 10px; background: var(--surface-2); font-size: .95rem; line-height: 1.2; }
  .om-age-c b { font-size: .95rem; }
  .om-age-c small { font-size: .68rem; color: var(--ink-soft); }
  .om-age-c.m1 { background: #E3F2E1; } .om-age-c.m2 { background: #EEF5E2; } .om-age-c.m0 { opacity: .55; }
  .om-bs { display: flex; flex-wrap: wrap; gap: .4rem; margin: .2rem 0 .3rem; }
  .om-b { display: inline-flex; align-items: center; min-height: 44px; padding: .3rem .8rem; border-radius: 999px; border: 1.5px solid var(--sky-deep); color: var(--sky-deep);
    font-weight: 800; font-size: .84rem; text-decoration: none; background: var(--surface); }
  .om-b.main { background: var(--sky-deep); color: var(--on-sky); }
  .om-voices p { font-size: .86rem; background: var(--surface-2); border-radius: 10px; padding: .45rem .65rem; }
  .om-voices small { display: block; color: var(--ink-soft); font-size: .74rem; }
  .om-share { font-size: .8rem; margin-top: .4rem !important; }
  .om-b.line { border-color: #06A04A; color: #057A39; }
  .om-pr { display: inline-block; margin-left: .3rem; font: 800 .66rem/1 var(--body); font-style: normal; letter-spacing: .06em; color: #fff; background: #5E5148; border-radius: 999px; padding: .2rem .45rem; vertical-align: .15em; }
  .om-gl { list-style: none; margin: 0; padding: .3rem .5rem .6rem; }
  .om-today { font-weight: 800; font-size: .84rem; }
  .om-today.on { color: #1F7A3A; } .om-today.off { color: #9A3412; }
  .om-new { display: inline-block; margin-left: .3rem; font: 800 .66rem/1 var(--body); color: #7C2D12; background: #FDE68A; border-radius: 999px; padding: .2rem .45rem; vertical-align: .15em; }
  .om-agekey { font-size: .7rem !important; color: var(--ink-soft); margin: -.35rem 0 .5rem !important; }
  .om-sub { margin: .2rem 0 .6rem; padding: .5rem .7rem; background: var(--surface-2); border-radius: 10px; font-size: .86rem; }
  .om-sub b { display: block; font-size: .76rem; margin-bottom: .2rem; }
  .om-sub ul { list-style: none; margin: 0; padding: 0; }
  .om-sub li { padding: .15rem 0; }
  .om-sub li small { color: var(--ink-soft); }
  .om-sub button { border: 0; background: none; padding: .2rem 0; min-height: 44px; text-align: left; font: 700 .86rem/1.4 var(--body); color: var(--sky-deep); text-decoration: underline; cursor: pointer; }
  .om-tgs { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .15rem; }
  .om-tg { font: 700 .68rem/1.2 var(--body); font-style: normal; border-radius: 999px; padding: .12rem .45rem; }
  .om-tg.on { color: #1F5F2E; background: #DCF0DF; } .om-tg.off { color: #7C2D12; background: #F6E3D6; }
  .om-tg.ev { color: #7C2D12; background: #FDE68A; } .om-tg.nw { color: #7C2D12; background: #FEF3C7; border: 1px solid #FCD34D; }
  .om-row.dim .om-ci, .om-row.dim .om-rb b { opacity: .6; }
  .om-top { position: fixed; right: 14px; bottom: 16px; z-index: 650; min-height: 46px; padding: .4rem 1rem; border-radius: 999px; border: 0;
    background: var(--sky-deep); color: var(--on-sky); font: 800 .88rem/1.2 var(--body); box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
  .om-top[hidden] { display: none; }
  .om-gl button small { color: var(--ink-soft); font-weight: 700; }
  .om-desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 0 !important; }
  .om-more-t { min-height: 44px; border: 0; background: none; padding: 0; font: 800 .82rem/1.2 var(--body); color: var(--sky-deep); text-decoration: underline; cursor: pointer; margin-bottom: .3rem; }
  .om-long { margin: 0 0 .3rem; font-size: .78rem; color: var(--ink-soft); }
  .om-lb { padding: .7rem .2rem .25rem; font: 800 .8rem/1.2 var(--body); color: #B33A0B; border-bottom: 1px solid var(--line); }
  .om-tg.na { color: var(--ink-soft); background: var(--surface-2); }
  .om-newline { margin: .5rem 0 0; font-size: .82rem; color: var(--ink-soft); }
  .om-newline b { color: #7C2D12; background: #FEF3C7; border-radius: 999px; padding: .05rem .5rem; margin-right: .3rem; }
  .om-evnote a, .om-season a { display: inline-block; min-height: 44px; line-height: 44px; font-weight: 800; }
  .leaflet-touch .leaflet-bar a, .leaflet-bar a { width: 44px !important; height: 44px !important; line-height: 44px !important; font-size: 20px !important; }
  @media (max-width: 380px) { .om-chip { font-size: .76rem; } .om-age button, .om-rain { font-size: .7rem; } .om-ctl button { padding: .2rem .5rem; font-size: .72rem; } }
  .om-gl button { display: flex; align-items: center; gap: .5rem; width: 100%; min-height: 44px; padding: .3rem .4rem; border: 0; border-bottom: 1px solid var(--line); background: none; text-align: left; font: 700 .9rem/1.35 var(--body); color: var(--ink); cursor: pointer; }

  /* 地図の下の一覧 */
  .om-lh { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; margin: 1.1rem 0 .4rem; }
  .om-lh h2 { font-family: var(--maru); font-weight: 800; font-size: 1.05rem; margin: 0; }
  .om-lh span { font-size: .8rem; color: var(--ink-soft); }
  .om-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .om-row { display: flex; align-items: center; gap: .65rem; width: 100%; min-height: 56px; padding: .5rem .2rem; border: 0; border-bottom: 1px solid var(--line);
    background: none; text-align: left; color: var(--ink); cursor: pointer; font: inherit; }
  .om-row.on { background: var(--sky-wash); }
  .om-rb { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .om-rb b { font-family: var(--maru); font-weight: 800; font-size: .95rem; line-height: 1.35; }
  .om-rb small { font-size: .78rem; color: var(--ink-soft); line-height: 1.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .om-rd { flex: 0 0 auto; font-size: .78rem; font-weight: 700; color: var(--ink-soft); }
  .om-none { padding: 1rem .2rem; color: var(--ink-soft); font-size: .9rem; }
  .om-more { display: block; width: 100%; min-height: 46px; margin: .6rem 0 0; border: 1.5px solid var(--line-strong); border-radius: 12px; background: var(--surface); font: 800 .9rem/1.2 var(--body); color: var(--sky-deep); cursor: pointer; }
  .om-more[hidden] { display: none; }
  .om-season, .om-evnote { font-size: .82rem; color: var(--ink-soft); line-height: 1.7; margin: .9rem 0 0; }
  .om-legal { font-size: .76rem; color: var(--ink-soft); margin: .5rem 0 0; }

  .bvc-invite { margin: 1.8rem 0 .4rem; padding: 1.2rem 1.1rem; border-radius: 16px; background: var(--surface-2, #F3F7F9); border: 1px solid rgba(44,124,158,.22); text-align: center; }
  .bvc-invite-h { font-family: var(--maru); font-weight: 800; font-size: 1.05rem; margin: 0 0 .5rem; }
  .bvc-invite-b { font-size: .88rem; line-height: 1.7; color: var(--ink-soft, #63727B); margin: 0 0 .9rem; }
  .bvc-invite-btn { display: inline-block; background: #06C755; color: #fff; text-decoration: none; font-weight: 800; font-size: 1rem; border-radius: 999px; padding: .85rem 1.8rem; box-shadow: 0 6px 18px rgba(6,199,85,.28); min-height: 44px; }
  @media (max-width: 480px) { .bvc-invite-btn { display: block; } }
  #post { margin: 2.2rem 0 0; scroll-margin-top: 1.5rem; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .om-age-c.m1 { background: #22402a; } :root:not([data-theme="light"]) .om-age-c.m2 { background: #2b3a25; } :root:not([data-theme="light"]) .om-when b { color: #F49A6B; } }
  :root[data-theme="dark"] .om-age-c.m1 { background: #22402a; } :root[data-theme="dark"] .om-age-c.m2 { background: #2b3a25; } :root[data-theme="dark"] .om-when b { color: #F49A6B; }
</style>
</head>
<script src="/assets/analytics.js" defer></script>
<body>
<nav class="bvnav" aria-label="サイト内">
  <div class="bvnav-in">
    <a class="bvnav-brand" href="/">ぼんぼやーじゅ通信</a>
    <div class="bvnav-links">
      <a href="/" class="bv-hide-sm">通信について</a>
      <a class="bvnav-cta" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
${navSub('map')}
</nav>

<main class="wrap">
  <header class="om-head">
    <h1>みんなのおでかけマップ</h1>
    <p class="om-lead">小平と となりの市の公園・児童館・図書館・カフェ・<b>催し</b></p>
  </header>

  <div class="om-chips" role="group" aria-label="種類でしぼる">${chips}</div>
  <div class="om-filters">
    <div class="om-age" role="group" aria-label="年齢でしぼる">
      <button type="button" data-age="" aria-pressed="true">全年齢</button><button type="button" data-age="baby" aria-pressed="false" aria-label="赤ちゃん（0〜2歳）">👶赤ちゃん</button><button type="button" data-age="pre" aria-pressed="false" aria-label="未就学（年少〜年長）">🧒未就学</button><button type="button" data-age="elem" aria-pressed="false">🎒小学生</button>
    </div>
  </div>
  <div class="om-toggles">
    <button type="button" class="om-rain" id="om-rain" aria-pressed="false">☔ 雨の日も行ける</button><button type="button" class="om-rain" id="om-now" aria-pressed="false">🕘 きょう行ける</button>
  </div>

  <div class="om-stage">
    <div id="om-map" role="region" aria-label="おでかけマップ"><noscript><p class="om-fail">地図の表示にはJavaScriptを使っています。切っている場合は、<a href="/cafe.html">カフェのページ</a>や<a href="/calendar.html">おでかけカレンダー</a>からお探しください。</p></noscript></div>
    <div class="om-ctl" role="group" aria-label="見る範囲">
      <button type="button" data-v="home">駅のまわり</button><button type="button" data-v="all">広く見る</button><button type="button" data-v="geo">📍現在地</button>
    </div>
    <div class="om-out" id="om-out" hidden></div>
    <div class="om-hint" id="om-hint">👆 ピンを押すと、年齢の目安と行き方が出ます</div>
    <div class="om-card" id="om-card" hidden aria-live="polite"></div>
  </div>

  ${newLine}
  <p class="om-newline" id="om-seen" hidden></p>
  <div class="om-lh"><h2 id="om-lt">花小金井駅から近い順</h2><span><b id="om-ln">0</b>件・距離は直線</span></div>
  <p class="om-long" id="om-long" hidden></p>
  <ul class="om-list" id="om-list" aria-labelledby="om-lt"></ul>
  <button type="button" class="om-more" id="om-more" hidden>もっと見る</button>
  <button type="button" class="om-top" id="om-top" hidden>↑ 地図へ</button>

  <p class="om-evnote">📅 催しは、場所が地図に落とせたものだけです。ほかの催しや、もっと先の予定は <a href="/calendar.html">おでかけカレンダー</a> に。</p>
  ${seasonNote}
  <p class="om-legal">場所の説明は、市や施設の公式ページで確かめたことを書いています。「💬 読者の方から」は、地元の家庭に教えていただいたことです。営業時間・料金・設備は変わることがあるので、おでかけ前に公式でご確認ください。</p>

  <section id="post">
    <noscript><p class="om-fail">投稿フォームの表示にJavaScriptを使っています。切っている方は
      <a href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE</a>でお知らせいただければ、こちらで載せます。</p></noscript>
  </section>

  <aside class="bvc-invite">
    <p class="bvc-invite-h">この地図、毎週すこしずつ増えています。</p>
    <p class="bvc-invite-b">地元の方に教えていただいた場所を足しています。<br>今週どこへ行くかは、毎週水曜の朝にLINEでおとどけしています。<br>友だち追加だけで届きます。個人情報の入力は不要です。</p>
    <a class="bvc-invite-btn" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINEで受け取る（無料）</a>
  </aside>

  <p class="support-line">この地図は、どなたでも無料でお使いいただけます。</p>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  ※営業時間・料金・設備は変わることがあります。おでかけ前に各公式サイトでご確認ください。<br>
  <a href="tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script src="/assets/leaflet/leaflet.js"></script>
<script src="/assets/leaflet/Leaflet.GoogleMutant.js?v=0.16.0"></script>
<script src="/assets/bv-odekake.js?v=20261128c"></script>
<script src="/assets/bv-post.js"></script>
<script type="application/json" id="om-items">${jsonInTag(ITEMS)}</script>
<script type="application/json" id="om-groups">${jsonInTag(used)}</script>
<script>
(function(){
  var items = JSON.parse(document.getElementById('om-items').textContent);
  BVOdekake.mount({ items: items, groups: JSON.parse(document.getElementById('om-groups').textContent), gmapsKey: ${JSON.stringify(GMAPS_KEY)} });
  BVPost.mount(document.getElementById('post'), {
    endpoint: ${JSON.stringify(POST_URL)},
    spots: ${jsonInTag(postSpots)},
    textLimit: ${TEXT_LIMIT},
    lineUrl: 'https://lin.ee/YtcfjnX'
  });
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  スポット ${nSpot}件・カフェ ${nCafe}軒・催し ${nEv}件（3週間・位置なしで出さない ${evNoPos}件）`);
console.log(`  季節の外で出さない: ${offSeason.map((s) => s.name).join('・') || 'なし'}`);
console.log(`  種類: ${used.map((g) => `${g.icon}${g.chip} ${ITEMS.filter((i) => i.g === g.key).length}`).join(' / ')}`);
console.log(`  地図の下地: ${GMAPS_KEY ? 'Googleマップ（読み込めなければ OpenStreetMap）' : 'OpenStreetMap（GMAPS_KEY が無い）'}`);
console.log(`  投稿の送り先: ${POST_URL || '未設定（フォームは出るが、送信時にコピー案内に切り替わる）'}`);
