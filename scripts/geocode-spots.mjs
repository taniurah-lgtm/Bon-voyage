#!/usr/bin/env node
/*
 * data/map-spots.json の各スポットに緯度経度を入れる。
 *   node scripts/geocode-spots.mjs            … lat/lng が無いものだけ引く
 *   node scripts/geocode-spots.mjs --all      … 全件引き直す
 *
 * OpenStreetMap の Nominatim を使う。利用規約に沿って
 *   - User-Agent を必ず付ける
 *   - 1秒に1件までに落とす
 *   - 結果はリポジトリに保存して、二度引かない
 *
 * ★取れなかったものは座標を書かない（推測で置かない）。
 *   地図にマーカーが出ないだけで、一覧には残る。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'data/map-spots.json';
const ALL = process.argv.includes('--all');
const UA = 'bonvoyage-tsushin/1.0 (https://bonvoya.nicomaru.tokyo/)';

// 花小金井を中心にした検索の絞り込み枠（南西・北東）。これを外れた結果は採用しない。
// だいたい 多摩全域＋所沢・都心西部が入る範囲。
const BOX = { south: 35.55, north: 35.85, west: 139.25, east: 139.80 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '3',
      countrycodes: 'jp',
      'accept-language': 'ja',
      viewbox: `${BOX.west},${BOX.north},${BOX.east},${BOX.south}`,
      bounded: '1',
    });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  for (const r of rows) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (lat >= BOX.south && lat <= BOX.north && lng >= BOX.west && lng <= BOX.east) {
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, matched: r.display_name };
    }
  }
  return null;
}

// スポットごとに検索語を上書きしたいときは JSON に geoQuery を書く。
// 1点に落ちない枠（「児童館・子育てひろば」など）は geoSkip: true を付ける。
// 「都立 小金井公園」→ 検索に効く形へ。括弧の中の地名はヒントとして後ろに足す
function queries(name) {
  const paren = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map((m) => m[1]).join(' ');
  const base = name.replace(/[（(][^）)]*[）)]/g, '').replace(/^(都立|国営|市立)\s*/, '').trim();
  const out = [base + (paren ? ' ' + paren.split(/[・、]/)[0] : ''), base];
  return [...new Set(out.map((q) => q.trim()).filter(Boolean))];
}

const spots = JSON.parse(readFileSync(FILE, 'utf8'));
let done = 0;
const failed = [];

for (const s of spots) {
  if (!ALL && typeof s.lat === 'number' && typeof s.lng === 'number') continue;
  if (s.geoSkip) { console.log(`  · ${s.name}: 1点に落ちない枠なので引かない`); continue; }
  let hit = null;
  for (const q of s.geoQuery ? [s.geoQuery] : queries(s.name)) {
    try {
      hit = await geocode(q);
    } catch (e) {
      console.error(`  ! ${s.name}: ${e.message}`);
    }
    await sleep(1100); // 1req/sec を守る
    if (hit) break;
  }
  if (hit) {
    s.lat = hit.lat;
    s.lng = hit.lng;
    s.geoSource = 'nominatim';
    s.geoMatched = hit.matched;
    done++;
    console.log(`  ✓ ${s.name} → ${hit.lat},${hit.lng}  (${hit.matched.slice(0, 48)})`);
  } else {
    delete s.lat;
    delete s.lng;
    failed.push(s.name);
    console.log(`  – ${s.name}: 座標が取れなかった（マーカーは出さない）`);
  }
}

writeFileSync(FILE, JSON.stringify(spots, null, 1) + '\n');
console.log(`\n${FILE}: 座標つき ${spots.filter((s) => s.lat).length}/${spots.length}件（今回 ${done}件追加）`);
if (failed.length) console.log('取れなかったもの:', failed.join(' / '));
