#!/usr/bin/env node
/*
 * 来月のおたよりが出ていないか見る（2026-11-28 オーナー「月末に翌月の情報を知りたい人もいる」）。
 *   node scripts/check-otayori.mjs
 * data/teirei.json の place のうち otayoriPattern（例 https://…/otayori/{YYYYMM}.pdf）があるものだけ、
 * 今月号と来月号のURLが開けるかを見て、data/otayori-auto.json に書く。ページを組むとき（build-teirei / build-map）に読む。
 * 見るのは決まった形のURLだけ（1館1〜2回）。つながらないときは何もしない（ページの組み立ては止めない）。
 * 中の日程は自動では読まない（月の20日すぎの巡回で読む。CLAUDE.md）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const today = process.env.BV_TODAY || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const t = JSON.parse(readFileSync('data/teirei.json', 'utf8'));
const OUT = 'data/otayori-auto.json';
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const addMonth = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const ym = today.slice(0, 7);
const months = [ym, addMonth(ym, 1)];
const seen = new Map();
async function opens(url) {
  if (seen.has(url)) return seen.get(url);
  let ok = false;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'bonvoyage-otayori-check/1.0' } });
    ok = r.ok && /pdf|image|html/.test(r.headers.get('content-type') || '');
  } catch { ok = null; }   // つながらない（＝分からない）
  seen.set(url, ok);
  return ok;
}
const out = {};
let found = 0, offline = false;
for (const sec of t.sections) for (const p of sec.places) {
  if (!p.otayoriPattern || !p.otayori) continue;
  const list = [];
  for (const m of months) {
    const url = p.otayoriPattern.replace('{YYYYMM}', m.replace('-', ''));
    const ok = await opens(url);
    if (ok === null) { offline = true; continue; }
    if (!ok) continue;
    list.push({ month: m, url, label: p.otayori.label.replace(/\d{1,2}月号/, `${+m.slice(5)}月号`) });
    found++;
  }
  // つながらなかった館は、前に見つけた分を残す
  out[p.key] = list.length || !offline ? list : (prev[p.key] || []);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`おたより: 決まった形のURLの館 ${Object.keys(out).length}か所・開けた号 ${found}件${offline ? '（つながらない所があった）' : ''}`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.map((x) => x.month).join('・') || 'なし'}`);
