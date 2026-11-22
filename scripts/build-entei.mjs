#!/usr/bin/env node
/*
 * 「こだいら幼稚園だより」のページを組む（もとは「園庭開放・未就園児の会」）。
 *   node scripts/build-entei.mjs
 *
 *   data/entei.json → docs/homepage/entei.html（URL は前のまま。LINE・チラシからのリンクを切らない）
 *
 * 2026-10-05 オーナー提案で「園庭開放」のまとめとして作った。
 * 2026-11-22 オーナー「園庭開放ではなく、小平の私立園のページにする。小平をひとつの大きな四角形にして、
 *   中に各園を四角形で並べた幼稚園マップ。タップでその園のホームページへ。園庭開放以外の情報も。11/25 にもらうものを受け入れられるように」
 *   → 小平市内の私立幼稚園・こども園15園（全園）を同じ形で並べる。1園だけ目立たせない（園長会と約束した載せ方）。
 *
 * ★ここに書くのは、各園の公式ページで確かめた事実と、園からいただいたお知らせ（letters）だけ。
 *   時間・費用・予約が書いていない会は null のままにし、ページにも「案内なし」と出す。推測で埋めない。
 * ★過ぎた日は、ページを開いた日に合わせてブラウザ側で隠す（組み直さなくても古くならない）。
 *   組んだ日の時点で過ぎている日は、最初から出さない。
 * ★確かめた日（checked。お知らせを受けた月はその受け取り日）から45日を過ぎた園は、組むたびに🔴で知らせる。
 * ★お知らせ（letters の最新の月）に載っていない園は、組むたびに一覧で出す（届いていない園の見落としを防ぐ）。
 *
 * 幼稚園マップ: 小平市の外枠（map.bounds）を cols×rows のマスに分け、園と駅を実際の位置にいちばん近いマスへ置く。
 *   位置は住所から国土地理院の住所検索で取った緯度経度（geo）。重ならないように、ずれの合計が最小になる並べ方を選ぶ。
 */
import { navSub } from './lib/nav.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/entei.json';
const OUT = 'docs/homepage/entei.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const STALE_DAYS = 45;
const SOON_DAYS = 28; // 「これからの幼稚園だより」で最初に見せる日数。それより先は「もっと先まで」で開く

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 🔒 公開ページに内部の話を出さない（仕組み・ファイル名・判定理由）
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部/;
// 🔒 個人の連絡先を撒かない（携帯・メール）
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;

const KINDS = {
  asobi: { label: '園庭であそぶ', cls: 'k-asobi' },
  oyako: { label: '親子の会', cls: 'k-oyako' },
  setsumei: { label: '説明会・見学', cls: 'k-setsumei' },
  gyouji: { label: '行事', cls: 'k-gyouji' },
  soudan: { label: '子育て相談', cls: 'k-soudan' },
};

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dow = (iso) => WD[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const label = (iso) => `${md(iso)}(${dow(iso)})`;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const short = (name) => name.replace(/（.*?）/g, '');
const ymLabel = (ym) => `${+ym.slice(5, 7)}月`;
const fmtDay = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const dateOf = (x) => (typeof x === 'string' ? x : x.d);

// ── 検査 ──────────────────────────────────────────────
const problems = [];
const warn = [];
const letters = (data.letters || []).slice().sort((a, b) => a.month.localeCompare(b.month));
const letterByMonth = new Map(letters.map((l) => [l.month, l]));
for (const l of letters) {
  if (!/^\d{4}-\d{2}$/.test(l.month)) problems.push(`letters: month の形がおかしい ${l.month}（YYYY-MM）`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.received || '')) problems.push(`letters ${l.month}: received（受け取った日 YYYY-MM-DD）が無い`);
}
// 協会（2026-11-22 オーナー「協会のリンクを貼ってよい。許可は得ている。上から中盤に」）
const K = data.kyokai;
if (K && (!K.name || !/^https:\/\//.test(K.url || ''))) problems.push('kyokai: name と url（https）を書く');
const NEED = ['key', 'name', 'label', 'type', 'town', 'addr', 'geo', 'homepage', 'url', 'checked'];
const keys = new Set();
for (const p of data.places) {
  for (const f of NEED) if (!p[f]) problems.push(`${p.name || p.key}: ${f} が無い`);
  if (keys.has(p.key)) problems.push(`${p.key}: key が重複`);
  keys.add(p.key);
  if (p.geo && (typeof p.geo.lat !== 'number' || typeof p.geo.lon !== 'number')) problems.push(`${p.name}: geo の lat/lon は数で`);
  if (!Array.isArray(p.programs)) problems.push(`${p.name}: programs が無い（会が無い園は [] と note）`);
  if (Array.isArray(p.programs) && !p.programs.length && !p.note) problems.push(`${p.name}: 会が無い園は note（ひとこと）を書く`);
  // 確かめた日: 公式ページを見た日と、この園の会が載ったお知らせの受け取り日の、新しいほう
  const srcs = new Set((p.programs || []).map((g) => g.src).filter(Boolean));
  const fresh = [p.checked, ...[...srcs].map((m) => letterByMonth.get(m)?.received).filter(Boolean)].sort().pop();
  if (fresh && daysBetween(fresh, todayJST) > STALE_DAYS) warn.push(`${p.name}: 確かめてから ${daysBetween(fresh, todayJST)} 日。公式ページを見直すか、次のお知らせを待つ`);
  for (const g of p.programs || []) {
    if (!KINDS[g.kind]) problems.push(`${p.name}「${g.title}」: kind が無いか違う（${Object.keys(KINDS).join('／')}）`);
    if (g.src && !letterByMonth.has(g.src)) problems.push(`${p.name}「${g.title}」: src ${g.src} の letters が無い（letters に月を足す）`);
    for (const x of g.dates || []) {
      const d = dateOf(x);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) problems.push(`${p.name}「${g.title}」: 日付の形がおかしい ${d}`);
      else if (g.weekly && dow(d) !== g.weekly) problems.push(`${p.name}「${g.title}」: ${d} は${dow(d)}曜（${g.weekly}曜のはず）`);
    }
    const upcoming = (g.dates || []).map(dateOf).filter((d) => d >= todayJST);
    if (!g.weekly && !upcoming.length && !g.more) warn.push(`${p.name}「${g.title}」: これからの日が無い。次の日程を公式で探すか、more に「まだ出ていない」と書く`);
  }
}
// お知らせ（最新の月）に、まだ載っていない園
const latest = letters[letters.length - 1];
if (latest) {
  const missing = data.places.filter((p) => !(p.programs || []).some((g) => g.src === latest.month)).map((p) => p.label);
  if (missing.length) warn.push(`${ymLabel(latest.month)}のお知らせに載っていない園（${missing.length}）: ${missing.join('・')}。届いた分に無ければ、そのままでよい（公式ページの分は残る）`);
}
// _ で始まるもの（このファイルの説明）は公開しないので除いて見る
const pub = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_')));
const allText = JSON.stringify(pub);
for (const m of allText.matchAll(new RegExp(LEAK, 'g'))) problems.push(`🔒 公開に出せない言葉: ${m[0]}`);
if (CONTACT.test(allText)) problems.push('🔒 個人の連絡先（携帯・メール）らしきものがある');

// ── 並び順 ────────────────────────────────────────────
// 町名の順。書き手の地元（花小金井）や、つながりのある園を先頭にしないため。
const TOWN_ORDER = ['小川町', '小川東町', '学園西町', '学園東町', '上水新町', '上水本町', '上水南町', '鈴木町', '仲町', '花小金井', '回田町'];
const townRank = (t) => (TOWN_ORDER.includes(t) ? TOWN_ORDER.indexOf(t) : 99);
for (const x of data.places) if (!TOWN_ORDER.includes(x.town)) problems.push(`${x.name}: 町名「${x.town}」の並び順が未登録（TOWN_ORDER に足す）`);
if (problems.length) {
  console.error('🔴 組めません:\n  ' + problems.join('\n  '));
  process.exit(1);
}
data.places.sort((a, b) => townRank(a.town) - townRank(b.town) || a.name.localeCompare(b.name, 'ja'));

// ── 幼稚園マップ（マスへの割り当て）──────────────────────────
// 園と駅を、実際の位置にいちばん近いマスへ。ずれの合計が小さくなるまで入れ替える（決まった結果になる）。
const M = data.map;
const C = M.cols, R = M.rows, B = M.bounds;
const YS = 0.55; // 縦のずれを軽く見る（小平は東西に長い。マスは横長なので、縦の1マスは実際より短い）
const norm = (lat, lon) => [(lon - B.w) / (B.e - B.w), (B.n - lat) / (B.n - B.s)];
const nodes = [
  ...data.places.map((p) => ({ id: p.key, w: 1, pos: norm(p.geo.lat, p.geo.lon), place: p })),
  ...M.stations.map((s, i) => ({ id: `st${i}`, w: 0.7, pos: norm(s.lat, s.lon), station: s })),
];
for (const n of nodes) {
  const [x, y] = n.pos;
  if (x < 0 || x > 1 || y < 0 || y > 1) problems.push(`${n.place?.name || n.station.name}: 小平の外枠（map.bounds）の外にある`);
}
if (nodes.length > C * R) problems.push(`マスが足りない（${nodes.length} > ${C}×${R}）`);
if (problems.length) {
  console.error('🔴 組めません:\n  ' + problems.join('\n  '));
  process.exit(1);
}
const cellCenter = (c) => [((c % C) + 0.5) / C, (Math.floor(c / C) + 0.5) / R];
const cost = (n, c) => { const [x, y] = cellCenter(c); return n.w * ((n.pos[0] - x) ** 2 + ((n.pos[1] - y) * YS) ** 2); };
const at = new Map(); // node.id → cell
{
  const free = new Set([...Array(C * R).keys()]);
  const left = nodes.slice();
  while (left.length) {
    let best = null;
    for (const n of left) for (const c of free) {
      const v = cost(n, c);
      if (!best || v < best.v - 1e-12 || (Math.abs(v - best.v) <= 1e-12 && (n.id + c) < (best.n.id + best.c))) best = { v, n, c };
    }
    at.set(best.n.id, best.c); free.delete(best.c); left.splice(left.indexOf(best.n), 1);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], ca = at.get(a.id), cb = at.get(b.id);
      if (cost(a, cb) + cost(b, ca) < cost(a, ca) + cost(b, cb) - 1e-12) { at.set(a.id, cb); at.set(b.id, ca); improved = true; }
    }
    for (const n of nodes) for (const c of [...free]) {
      if (cost(n, c) < cost(n, at.get(n.id)) - 1e-12) { free.add(at.get(n.id)); free.delete(c); at.set(n.id, c); improved = true; }
    }
  }
}
const byCell = new Map([...at].map(([id, c]) => [c, nodes.find((n) => n.id === id)]));

// ── 部品 ──────────────────────────────────────────────
const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(short(p.name) + ' ' + p.addr)}`;
const kindChip = (k) => `<span class="kc ${KINDS[k].cls}">${KINDS[k].label}</span>`;

function upcomingDates(p) {
  const out = [];
  for (const g of p.programs) for (const x of g.dates || []) { const d = dateOf(x); if (d >= todayJST) out.push(d); }
  return [...new Set(out)].sort();
}

// 5文字以上の名前は、まん中で2行に分ける（「たかのだ／い」のように1文字だけ落ちないように）
const tileLabel = (s) => (s.length >= 5 ? `${esc(s.slice(0, Math.ceil(s.length / 2)))}<wbr>${esc(s.slice(Math.ceil(s.length / 2)))}` : esc(s));

function tile(n) {
  if (!n) return '<span class="cell" aria-hidden="true"></span>';
  if (n.station) return `<span class="cell st" aria-hidden="true"><span>${esc(n.station.name)}</span></span>`;
  const p = n.place;
  const weekly = p.programs.filter((g) => g.weekly).map((g) => g.weekly);
  const wk = weekly.length ? `毎週${[...new Set(weekly)].join('・')}` : '';
  return `<a class="cell en-t" href="${esc(p.homepage)}" target="_blank" rel="noopener" data-dates="${upcomingDates(p).join(',')}" data-wk="${esc(wk)}" aria-label="${esc(p.name)}のホームページ（新しいタブで開きます）" data-goatcounter-click="幼稚園マップ｜${esc(p.label)}"><b>${tileLabel(p.label)}</b><small class="nx"></small></a>`;
}

const mapHtml = `<div class="emap">
      <div class="nb nb-top"><span>← ${esc(M.neighbors.w)}</span><span>↑ ${esc(M.neighbors.n)}</span><span>${esc(M.neighbors.e)} →</span></div>
      <div class="frame">
        <span class="frame-l">小平市</span>
        <div class="grid" style="--cols:${C}">
          ${[...Array(C * R).keys()].map((c) => tile(byCell.get(c))).join('\n          ')}
        </div>
      </div>
      <div class="nb nb-bot"><span>↓ ${esc(M.neighbors.s)}</span></div>
    </div>`;

function dateChips(g) {
  const items = (g.dates || []).map((x) => (typeof x === 'string' ? { d: x } : x)).filter((x) => x.d >= todayJST);
  if (!items.length) return '';
  return `<ul class="dates">${items
    .map((x) => `<li data-d="${x.d}"><b>${label(x.d)}</b>${x.t ? `<span>${esc(x.t)}</span>` : ''}${x.time ? `<span>${esc(x.time)}</span>` : ''}</li>`)
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
  const done = !g.weekly ? `<p class="more done" hidden>ここに出ている日は終わりました。次の日程は園のページで。</p>` : '';
  return `<div class="prog" data-k="${g.kind}">
        <p class="pk">${kindChip(g.kind)}${tag}</p>
        <h3>${esc(g.title)}</h3>
        ${when}${chips}${more}${done}
        <div class="kvs">
          ${row('時間', g.time)}
          ${row('対象', g.who)}
          ${row('費用', g.cost)}
          ${row('予約', g.book ?? '園のページに予約の案内はありません')}
          ${row('雨の日', g.rain)}
          ${row('場所', g.where)}
        </div>
        ${(g.notes || []).length ? `<ul class="notes">${g.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>`;
}

function place(p) {
  const link2 = p.url2 ? ` <a class="lk" href="${esc(p.url2.href)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜sns">${esc(p.url2.label)}</a>` : '';
  const page = p.url !== p.homepage ? `<a class="lk" href="${esc(p.url)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜公式">会の案内ページ</a>` : '';
  const months = [...new Set(p.programs.map((g) => g.src).filter(Boolean))].sort();
  const fromLetter = months.map((m) => `${ymLabel(m)}の予定は、${fmtDay(letterByMonth.get(m).received)}に園からいただいたお知らせです`).join('。');
  return `<article class="en" id="${p.key}">
      <div class="en-h">
        <h2>${esc(p.name)}</h2>
        <p class="town">${esc(p.type)}・${esc(p.town)}</p>
      </div>
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      ${p.programs.map(program).join('\n      ')}
      ${!p.programs.length && p.note ? `<p class="none">${esc(p.note)}</p>` : ''}
      ${p.footnote ? `<p class="fn">${esc(p.footnote)}</p>` : ''}
      <div class="en-f">
        <span class="chk">${fmtDay(p.checked)}に、園の公式ページで確かめました${fromLetter ? `。${esc(fromLetter)}` : ''}</span>
        <span class="acts">
          <a class="lk" href="${esc(p.homepage)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜ホーム">ホームページ</a>${page ? ` ${page}` : ''}${link2}
          <a class="lk" href="${mapUrl(p)}" target="_blank" rel="noopener" data-goatcounter-click="園庭｜${esc(short(p.name))}｜地図">地図</a>
        </span>
      </div>
    </article>`;
}

// 「これからの幼稚園だより」の材料（日付のあるもの。種類を問わず）
const soon = [];
for (const p of data.places) {
  for (const g of p.programs) {
    for (const x of g.dates || []) {
      const d = dateOf(x);
      if (d < todayJST) continue;
      soon.push({
        d, en: p.label, key: p.key, kind: g.kind,
        t: (typeof x === 'object' && x.t) || g.title,
        time: (typeof x === 'object' && x.time) || g.time || '',
        open: !!g.open, book: !!g.book,
      });
    }
  }
}
soon.sort((a, b) => a.d.localeCompare(b.d) || a.en.localeCompare(b.en, 'ja'));
const weekly = [];
for (const p of data.places) for (const g of p.programs) if (g.weekly) weekly.push({ en: p.label, key: p.key, wd: g.weekly, t: g.title, time: g.time || '', kind: g.kind });

let lastMonth = '';
const soonRows = soon.map((x) => {
  const m = x.d.slice(0, 7);
  const head = m !== lastMonth ? `<li class="mh" data-m="${m}">${ymLabel(m)}</li>\n        ` : '';
  lastMonth = m;
  const tag = x.open ? '<span class="tag ok">予約なし</span>' : x.book ? '<span class="tag bk">申込み</span>' : '';
  return `${head}<li data-d="${x.d}" data-k="${x.kind}"><span class="sd">${label(x.d)}</span><span class="sb"><a href="#${x.key}">${esc(x.en)}</a> ${esc(x.t)}<small>${kindChip(x.kind)}${tag}${x.time ? esc(x.time) : ''}</small></span></li>`;
}).join('\n        ');
const weeklyRows = weekly
  .map((x) => `<li data-k="${x.kind}"><span class="sd">毎週${x.wd}</span><span class="sb"><a href="#${x.key}">${esc(x.en)}</a> ${esc(x.t)}<small>${kindChip(x.kind)}${x.time ? esc(x.time) : ''}</small></span></li>`)
  .join('\n        ');
const kindsUsed = Object.keys(KINDS).filter((k) => soon.some((x) => x.kind === k) || weekly.some((x) => x.kind === k));

const n = data.places.length;
const title = 'こだいら幼稚園だより（小平市の私立幼稚園・こども園）';
const desc = `小平市内の私立幼稚園・こども園${n}園の、入園前の親子に開いている会。園庭開放・未就園児の会・説明会・行事を、園ごとにまとめています。幼稚園マップから各園のホームページへ。`;

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
  :root {
    --oyako-wash:#E8F3E6; --oyako-ink:#3D6B3A;
    --gyouji-wash:#F8E7E4; --gyouji-ink:#9E4C43;
    --soudan-wash:#EEEAF4; --soudan-ink:#5B4F7A;
    --map-ground:#F3F6EE;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --oyako-wash:#22362A; --oyako-ink:#A9D6A3;
      --gyouji-wash:#3A2826; --gyouji-ink:#E8A39B;
      --soudan-wash:#2C2A3A; --soudan-ink:#C7BEE4;
      --map-ground:#1C2B26;
    }
  }
  :root[data-theme="dark"] {
    --oyako-wash:#22362A; --oyako-ink:#A9D6A3;
    --gyouji-wash:#3A2826; --gyouji-ink:#E8A39B;
    --soudan-wash:#2C2A3A; --soudan-ink:#C7BEE4;
    --map-ground:#1C2B26;
  }
  main { padding: 1.2rem 0 1rem; }
  .ghead-in { padding-top: 1.4rem; padding-bottom: 1.2rem; }
  .ghead h1 { font-size: clamp(1.45rem, 4.8vw, 2rem); margin-bottom: .35rem; }
  .ghead .sub { font-size: .92rem; line-height: 1.75; }
  .lead { color: var(--ink-soft); font-size: .86rem; line-height: 1.75; margin-bottom: 1rem; }
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.6rem 0 .6rem; }
  h2.sec:first-child { margin-top: .4rem; }

  /* 幼稚園マップ */
  .emap { margin: 0 0 .5rem; }
  .nb { display: flex; justify-content: space-between; gap: .5rem; font-size: .68rem; color: var(--ink-faint); line-height: 1.4; }
  .nb-top { margin-bottom: .55rem; }
  .nb-bot { justify-content: center; margin-top: .3rem; }
  .frame { position: relative; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--map-ground); padding: .55rem .4rem .45rem; }
  .frame-l { position: absolute; top: -.75em; left: .8rem; background: var(--ground); padding: 0 .4rem; font-family: var(--maru); font-weight: 800; font-size: .76rem; color: var(--ink-soft); line-height: 1.4; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 5px; }
  .cell { min-height: 46px; border-radius: 9px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3px 2px; line-height: 1.2; }
  .en-t { background: var(--surface); border: 1.5px solid var(--sky); box-shadow: 0 1px 0 var(--line-strong); text-decoration: none; color: var(--ink); }
  .en-t:hover, .en-t:focus-visible { background: var(--sky-wash); }
  .en-t b { font-family: var(--maru); font-weight: 800; font-size: clamp(10px, 2.7vw, 14px); letter-spacing: -.02em; word-break: keep-all; }
  .en-t .nx { font-size: clamp(8.5px, 2.2vw, 11px); color: var(--marigold-ink); font-weight: 700; margin-top: 1px; min-height: 1.2em; }
  .st { border: 1px dashed var(--ink-faint); color: var(--ink-soft); font-size: clamp(8px, 2.1vw, 11px); letter-spacing: -.05em; white-space: nowrap; overflow: hidden; }
  @media (max-width: 340px) { .st { white-space: normal; } }
  .st span::before { content: ""; display: block; width: 1.6em; height: 2px; margin: 0 auto 3px; background: var(--ink-faint); border-radius: 2px; }
  .mapcap { font-size: .78rem; color: var(--ink-soft); line-height: 1.7; margin-top: .45rem; }
  .mapcap b { color: var(--ink); }
  .kyo { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem .9rem; margin: 1rem 0 0; padding: .8rem 1rem; background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--sky); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); }
  .kyo-t { flex: 1 1 15rem; font-size: .84rem; color: var(--ink-soft); line-height: 1.75; }
  .kyo-t b { display: block; font-family: var(--maru); font-weight: 800; font-size: .95rem; color: var(--ink); }
  .kyo .lk { flex: none; }

  /* これからの幼稚園だより */
  .soon { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: .9rem 1rem; }
  .soon h3 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0 0 .45rem; color: var(--sky-deep); }
  .filt { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 .5rem; }
  .filt button { font: inherit; font-size: .76rem; font-weight: 700; min-height: 34px; padding: 0 .75rem; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
  .filt button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }
  .soon ul { list-style: none; margin: 0 0 .8rem; padding: 0; }
  .soon li { display: flex; gap: .7rem; padding: .42rem 0; border-top: 1px dashed var(--line); font-size: .88rem; line-height: 1.55; }
  .soon li.mh { display: block; border-top: 0; padding: .55rem 0 .1rem; font-family: var(--maru); font-weight: 800; font-size: .8rem; color: var(--ink-soft); }
  .soon li.mh + li { border-top: 0; }
  .soon .sd { flex: none; width: 4.6em; font-family: var(--maru); font-weight: 800; color: var(--ink); }
  .soon .sb a { font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .soon small { display: flex; flex-wrap: wrap; align-items: center; gap: .1rem .45rem; color: var(--ink-faint); font-size: .76rem; margin-top: .1rem; }
  .soon small .tag { margin-left: 0; }
  .soon .empty { color: var(--ink-soft); font-size: .86rem; }
  .soon .wk { font-size: .78rem; color: var(--ink-faint); margin-top: .2rem; }
  .morebtn { font: inherit; font-size: .8rem; font-weight: 700; color: var(--link-ink); background: none; border: 1px solid var(--line-strong); border-radius: 999px; min-height: 36px; padding: 0 .9rem; cursor: pointer; margin: -.3rem 0 .8rem; }

  .kc { display: inline-block; font-size: .66rem; font-weight: 700; border-radius: 6px; padding: 0 .4rem; line-height: 1.7; white-space: nowrap; }
  .k-asobi { background: var(--sky-wash); color: var(--sky-deep); }
  .k-oyako { background: var(--oyako-wash); color: var(--oyako-ink); }
  .k-setsumei { background: var(--marigold-wash); color: var(--marigold-ink); }
  .k-gyouji { background: var(--gyouji-wash); color: var(--gyouji-ink); }
  .k-soudan { background: var(--soudan-wash); color: var(--soudan-ink); }

  /* 園ごと */
  .en { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: 1rem 1.05rem .8rem; margin-bottom: .9rem; scroll-margin-top: 96px; }
  .en-h { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .en h2 { font-family: var(--maru); font-weight: 800; font-size: 1.04rem; margin: 0; line-height: 1.4; }
  .town { font-size: .78rem; color: var(--ink-faint); }
  .intro { font-size: .86rem; color: var(--ink-soft); margin-top: .35rem; line-height: 1.7; }
  .none { font-size: .86rem; color: var(--ink-soft); margin-top: .5rem; line-height: 1.75; background: var(--surface-2); border-radius: 8px; padding: .5rem .7rem; }
  .prog { margin-top: .8rem; padding-top: .7rem; border-top: 1px solid var(--line); }
  .prog:first-of-type { border-top: 0; padding-top: 0; }
  .pk { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .2rem; }
  .prog h3 { font-family: var(--maru); font-weight: 800; font-size: .94rem; margin: 0 0 .35rem; line-height: 1.5; }
  .tag { display: inline-block; font-size: .66rem; font-weight: 700; border-radius: 999px; padding: .05rem .5rem; vertical-align: .12em; margin-left: .3rem; white-space: nowrap; line-height: 1.6; }
  .pk .tag { margin-left: 0; }
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
  .chk { font-size: .72rem; color: var(--ink-faint); line-height: 1.6; }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .75rem; background: var(--surface); white-space: nowrap; }

  /* 園の目次 */
  .idx { display: grid; gap: .3rem; margin: 0 0 1.1rem; font-size: .84rem; }
  .idx div { display: grid; grid-template-columns: 4.6em 1fr; align-items: baseline; gap: .7rem; }
  .idx .it { font-size: .74rem; color: var(--ink-faint); }
  .idx .il { display: flex; flex-wrap: wrap; gap: 0 .8rem; }
  .idx a { font-weight: 700; color: var(--link-ink); text-decoration: none; min-height: 32px; display: inline-flex; align-items: center; }

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
      <a class="bvnav-cta" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE<span class="bv-lg">で受け取る</span></a>
    </div>
  </div>
${navSub('entei')}
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>こだいら幼稚園だより</h1>
    <p class="sub">小平市内の私立幼稚園・こども園${n}園の、入園前の親子に開いている会。園庭開放・未就園児の会・説明会・行事を、園ごとにまとめました。</p>
  </div>
</header>

<main class="wrap">
  <h2 class="sec">幼稚園マップ</h2>
  ${mapHtml}
  <p class="mapcap">小平市をひとつの四角にして、${n}園と駅を、おおよその場所に並べました。<b>園の四角をタップすると、その園のホームページが開きます。</b>オレンジの字は、次に会がある日です。</p>
  ${K ? `<aside class="kyo" aria-label="${esc(K.name)}">
    <p class="kyo-t"><b>${esc(K.name)}</b>市内の私立幼稚園・認定こども園${n}園すべてが加盟している団体です。園選びの案内や、幼稚園の補助金・預かり保育のことは、協会のホームページにまとまっています。毎月の各園のお知らせは、協会を通じていただいています。</p>
    <a class="lk" href="${esc(K.url)}" target="_blank" rel="noopener" data-goatcounter-click="幼稚園｜協会">協会のホームページ</a>
  </aside>` : ''}

  <h2 class="sec">これからの幼稚園だより</h2>
  <section class="soon" aria-label="これからの幼稚園だより">
    <div class="filt" role="group" aria-label="種類でしぼる">
      <button type="button" data-f="all" aria-pressed="true">すべて</button>
      ${kindsUsed.map((k) => `<button type="button" data-f="${k}" aria-pressed="false">${KINDS[k].label}</button>`).join('\n      ')}
    </div>
    <ul id="soon">
        ${soonRows}
    </ul>
    <button type="button" class="morebtn" id="soon-more" hidden>もっと先まで見る</button>
    <p class="empty" id="soon-empty" hidden>この先しばらく、日付の決まった会は見つかっていません。下の「毎週」の園や、各園のページをご覧ください。</p>
    <h3>毎週ひらいている園</h3>
    <ul id="weekly">
        ${weeklyRows}
    </ul>
    <p class="wk">毎週の会も、お休みの週や中止の日があります。雨や園の行事で中止になる日もあるので、<b>出かける前に各園のページで</b>確かめてください。</p>
  </section>

  <h2 class="sec">園ごとの案内</h2>
  <p class="lead">在園していなくても参加できる会を載せています。2歳児クラスのような入会制のプレ教室は、このページでは扱っていません。</p>
  <nav class="idx" aria-label="園の一覧">
    ${(() => {
      const by = new Map();
      for (const p of data.places) by.set(p.town, [...(by.get(p.town) || []), p]);
      return [...by].map(([t, ps]) => `<div><span class="it">${esc(t)}</span><span class="il">${ps.map((p) => `<a href="#${p.key}">${esc(short(p.name))}</a>`).join('')}</span></div>`).join('\n    ');
    })()}
  </nav>
  ${data.places.map(place).join('\n  ')}

  <h2 class="sec">行く前に</h2>
  <div class="tips">
    <ul>
      <li>園は、在園の子どもたちが毎日すごしている場所です。飲食・おもちゃ・自転車など、各園のお願いを守って。</li>
      <li>駐車場のない園がほとんどです。歩き・自転車・バスで。</li>
      <li>園庭では、在園の子どもたちも遊んでいることがあります。お子さんから目を離さずに。</li>
      <li>入園を考えている園なら、ふだんの雰囲気を見られる機会にもなります。</li>
    </ul>
  </div>

  <p class="about">各園の公式ページ（園のInstagramを含む）と、園からいただいたお知らせをもとに、園ごとに確かめた日を書いています。まとめサイトからの転載はしていません。<br>
  内容のまちがいや、載っていない会に気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。園の方からのご連絡も歓迎です。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/map.html">おでかけマップ</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
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
  var DAY = 864e5, now = Date.now() + 9 * 3600e3;
  var t = new Date(now).toISOString().slice(0, 10);
  var lim = new Date(now + ${SOON_DAYS - 1} * DAY).toISOString().slice(0, 10);
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function md(d) { return (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)); }

  /* 幼稚園マップ: 次に会がある日 */
  document.querySelectorAll('.en-t').forEach(function (a) {
    var ds = (a.getAttribute('data-dates') || '').split(',').filter(function (d) { return d && d >= t; });
    var nx = a.querySelector('.nx');
    if (ds.length) nx.textContent = '次 ' + md(ds[0]);
    else if (a.getAttribute('data-wk')) nx.textContent = a.getAttribute('data-wk');
  });

  /* 園ごと: 過ぎた日を隠す */
  document.querySelectorAll('.dates li[data-d]').forEach(function (li) {
    if (li.getAttribute('data-d') < t) li.hidden = true;
  });
  document.querySelectorAll('.prog').forEach(function (g) {
    var ul = g.querySelector('.dates'), done = g.querySelector('.done');
    if (!ul || !done) return;
    var left = ul.querySelectorAll('li:not([hidden])').length;
    if (!left) { ul.hidden = true; if (!g.querySelector('.more:not(.done)')) done.hidden = false; }
  });

  /* これからの幼稚園だより: 種類でしぼる・4週間より先は「もっと先まで」で開く */
  var kind = 'all', all = false;
  var rows = [].slice.call(document.querySelectorAll('#soon li[data-d]'));
  var heads = [].slice.call(document.querySelectorAll('#soon li.mh'));
  var wrows = [].slice.call(document.querySelectorAll('#weekly li[data-k]'));
  var more = document.getElementById('soon-more'), empty = document.getElementById('soon-empty');
  function draw() {
    var shown = 0, later = 0;
    rows.forEach(function (li) {
      var d = li.getAttribute('data-d'), k = li.getAttribute('data-k');
      var ok = d >= t && (kind === 'all' || k === kind);
      var near = d <= lim;
      li.hidden = !(ok && (near || all));
      if (ok && !near) later++;
      if (!li.hidden) shown++;
    });
    heads.forEach(function (h) {
      var m = h.getAttribute('data-m'), any = rows.some(function (li) { return !li.hidden && li.getAttribute('data-d').slice(0, 7) === m; });
      h.hidden = !any;
    });
    wrows.forEach(function (li) { li.hidden = !(kind === 'all' || li.getAttribute('data-k') === kind); });
    more.hidden = all || !later;
    more.textContent = 'もっと先まで見る（' + later + '件）';
    empty.hidden = shown > 0 || later > 0;
  }
  document.querySelectorAll('.filt button').forEach(function (b) {
    b.addEventListener('click', function () {
      kind = b.getAttribute('data-f');
      document.querySelectorAll('.filt button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      draw();
    });
  });
  more.addEventListener('click', function () { all = true; draw(); });
  draw();
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
console.log(`wrote ${OUT}（${n}園 / これからの日 ${soon.length}件・毎週 ${weekly.length}件 / お知らせ ${letters.length ? letters.map((l) => ymLabel(l.month)).join('・') : 'まだなし'}）`);
// 幼稚園マップの並び（確かめ用）
for (let r = 0; r < R; r++) {
  console.log('  ' + [...Array(C).keys()].map((c) => { const x = byCell.get(r * C + c); return (x ? (x.place ? x.place.label : '🚉' + x.station.name.replace('駅', '')) : '・').padEnd(5, '　'); }).join(''));
}
for (const w of warn) console.log('  🔴 ' + w);
