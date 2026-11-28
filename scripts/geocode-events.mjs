#!/usr/bin/env node
/*
 * 🆕 2026-11-28 おでかけマップの「これからの催し」のピンの位置。
 *   node scripts/geocode-events.mjs          （data/events.json の、これから60日の催し）
 *
 * 位置の決め方（たしかなものだけ。決まらなければピンは立てない＝一覧と「カレンダーで見る」だけ）:
 *   1. 場所の欄に住所（「小平市小川東町4-4」など）があれば、国土地理院の住所検索で求める
 *   2. 無ければ、会場の表（data/event-places.json。公式などで確かめた住所）に名前があれば、その住所で
 *   3. 無ければ、おでかけマップのスポット（data/map-spots.json）と名前が合えば、その位置
 * 結果は data/event-geo.json に貯める（台帳のIDごと。場所の欄が変わったら求め直す）。
 * ネットにつながらないときは、貯めてある分だけで終わる（ページの組み立ては止めない）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CACHE = 'data/event-geo.json';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const events = JSON.parse(readFileSync('data/events.json', 'utf8')).events;
const spots = JSON.parse(readFileSync('data/map-spots.json', 'utf8')).filter((s) => typeof s.lat === 'number');
// 番地の無い催しでも、よく使われる会場は data/event-places.json の住所で求める
const VENUES = existsSync('data/event-places.json') ? JSON.parse(readFileSync('data/event-places.json', 'utf8')).places : [];
const venueOf = (e) => VENUES.find((v) => `${e.place || ''}|${e.mapq || ''}`.includes(v.match));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const until = new Date(Date.now() + (9 + 24 * 60) * 3600e3).toISOString().slice(0, 10);

const z2h = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－−‐ー―]/g, '-');
// 日付のどれかが60日のうちにあるか、期間（span）が60日にかかっているもの。
// 🔴 期間の催し（プラネタリウム・ライトアップなど）は dates に初日しか無いことがあるので、span も必ず見る
function upcoming(e) {
  const ds = (e.dates || []).filter(Boolean);
  if (ds.some((d) => d >= today && d <= until)) return true;
  return !!(e.span && e.span.from && e.span.to && e.span.from <= until && e.span.to >= today);
}
// 住所: 「〇〇市（区）〇〇町1-2-3」「〇〇市〇〇町1丁目3005」。番地まで無いもの（町名だけ）は使わない（町の真ん中に立ってしまう）
const ADDR = /(?:東京都)?([^\s（）()、。・／,]{1,6}?[市区])([^\s（）()、。・／,0-9]{1,8}?)(\d{1,4}(?:丁目\d{1,5}|-\d{1,5})(?:-\d{1,5})?)/;
const TOWN_NO = /([^\s（）()、。・／,0-9]{1,8}?[町台村])(\d{1,4}(?:丁目\d{1,5}|-\d{1,5})(?:-\d{1,5})?)/;
function addressOf(place) {
  const p = z2h(place);
  const m = p.match(ADDR);
  if (m) return `東京都${m[1]}${m[2]}${m[3]}`;
  // 「小平市ふれあい下水道館（…／上水本町1-25-31）」: 市の名前と番地が離れている
  const c = p.match(/([^\s（）()、。・／,]{1,6}?市)/), t = p.match(TOWN_NO);
  return c && t ? `東京都${c[1].replace(/^.*?(\S{1,4}市)$/, '$1')}${t[1]}${t[2]}` : '';
}
const core = (s) => String(s || '').replace(/[（(].*$/, '').replace(/^(都立|国営|市立|小平市立|小平市)\s*/, '').replace(/\s+/g, '');
function spotOf(e) {
  const hay = core(e.mapq) + '|' + core(e.place);
  return spots.find((s) => { const c = core(s.name); return c.length >= 3 && hay.includes(c); });
}
async function gsi(q) {
  const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'bonvoyage-map-builder/1.0' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  const want = q.replace(/^東京都/, '').replace(/\d.*$/, '');
  // 番地まで当たったものだけ（「小川町一丁目」のように丁目で止まった答えは、町の真ん中に立つので使わない）
  const hit = j.find((x) => x.properties.title.replace(/^東京都/, '').startsWith(want) && /[0-9０-９]+(番|号)/.test(x.properties.title));
  return hit ? { lat: +hit.geometry.coordinates[1].toFixed(6), lng: +hit.geometry.coordinates[0].toFixed(6), title: hit.properties.title } : null;
}

let n = 0, made = 0, none = 0, offline = false;
for (const e of events.filter(upcoming)) {
  n++;
  const key = e.id, sig = `${e.place || ''}|${e.mapq || ''}|${(venueOf(e) || {}).q || ''}`;
  if (cache[key] && cache[key].sig === sig) continue;
  let pos = null;
  const ven = venueOf(e);
  const addr = addressOf(e.place) || (ven ? ven.q : '');
  if (addr && !offline) {
    try { const g = await gsi(addr); if (g) pos = { lat: g.lat, lng: g.lng, src: `住所（国土地理院）: ${g.title}` }; }
    catch { offline = true; console.error('⚠️ 住所検索につながらない。貯めてある分だけで続ける'); }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!pos) { const s = spotOf(e); if (s) pos = { lat: s.lat, lng: s.lng, src: `マップのスポット: ${s.name}` }; }
  if (offline && !pos) continue;   // つながらないときは「位置なし」と決めつけない
  cache[key] = pos ? { ...pos, sig } : { none: true, sig };
  if (pos) made++; else none++;
}
// 終わった催しは消す（貯めすぎない）
const live = new Set(events.filter(upcoming).map((e) => e.id));
for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');
const have = Object.values(cache).filter((v) => !v.none).length;
console.log(`これからの催し ${n}件 → 位置あり ${have}件（今回 新しく ${made}件・位置なし ${none}件）`);
