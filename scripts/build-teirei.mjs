#!/usr/bin/env node
/*
 * 児童館・図書館・子育てひろばの「定例」のページを組む。
 *   node scripts/build-teirei.mjs
 *
 *   data/teirei.json → docs/homepage/teirei.html
 *
 * 2026-10-06 オーナー依頼（カテゴリ別のまとめページの2つめ。1つめは園庭開放 build-entei.mjs）。
 * 毎月くり返す会（図書館のおはなし会・絵本のへや、児童館のこども広場、子育てひろば、出張ひろば）を
 * 施設ごとにまとめ、上に「これから2週間」を日付ごとに出す。
 *
 * ★書くのは公式（図書館の行事ページ・年間予定表、児童館だより、子ども家庭支援センターだより）で確かめた事実だけ。
 *   書いていないことは null のままにし、推測で埋めない。
 * ★過ぎた日は、ページを開いた日に合わせてブラウザ側で隠す。
 * ★確かめた日（checked）から45日を過ぎた施設と、これからの日が無い会は、組むたびに🔴で知らせる。
 *   児童館・子育てひろばは月ごとのおたよりなので、毎月の第1水曜の巡回で取り直す（docs/sources.md）。
 */
import { navSub } from './lib/nav.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { publicUrl } from './lib/city-site.mjs';
import { spotSlug } from './lib/spot-slug.mjs';
import { otayoriOf } from './lib/otayori.mjs';
import { layoutTiles } from './lib/tilemap.mjs';

const SRC = 'data/teirei.json';
const OUT = process.env.TEIREI_OUT || 'docs/homepage/teirei.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const STALE_DAYS = 45;
const SHOW_CHIPS = 6; // 日付は先の6回まで見せ、残りは「もっと見る」

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const todayJST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 🔒 公開ページに内部の話を出さない（仕組み・ファイル名・判定理由）
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部/;
// 🔒 個人の連絡先を撒かない（携帯・メール）
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dow = (iso) => WD[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const label = (iso) => `${md(iso)}(${dow(iso)})`;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const short = (name) => name.replace(/（.*?）/g, '');
const shortOf = (p) => p.short || short(p.name);
const asItem = (x) => (typeof x === 'string' ? { d: x } : x);
// 年齢（2026-11-29 3つに分けた）: baby＝0〜3歳 / pre＝4〜6歳 / elem＝小学生。kids は pre+elem、all は3つとも。配列でも書ける
const AGE_KEYS = ['baby', 'pre', 'elem'];
const AGE_ALIAS = { baby: ['baby'], pre: ['pre'], elem: ['elem'], kids: ['pre', 'elem'], all: AGE_KEYS };
const agesOf = (a) => [...new Set((Array.isArray(a) ? a : [a]).flatMap((x) => AGE_ALIAS[x] || []))].sort((x, y) => AGE_KEYS.indexOf(x) - AGE_KEYS.indexOf(y));
const AGE_ICON = { baby: '👶', pre: '🧒', elem: '🎒' };
function ageLabel(a) {
  const k = agesOf(a).join(' ');
  return { baby: '👶 0〜3歳', pre: '🧒 4〜6歳', elem: '🎒 小学生', 'pre elem': '🧒🎒 4歳〜小学生', 'baby pre': '👶🧒 0〜6歳', 'baby pre elem': '👶🧒🎒 だれでも' }[k]
    || agesOf(a).map((x) => AGE_ICON[x]).join('');
}

// ── 検査 ──────────────────────────────────────────────
const problems = [];
const warn = [];
const places = data.sections.flatMap((s) => s.places);
for (const p of places) {
  if (!p.checked) problems.push(`${p.name}: checked（確かめた日）が無い`);
  // 🆕 2026-11-01 こども若者みらい課の提案:「各館のおたよりのリンクを、マップと組み合わせて」。古い号のままなら知らせる
  if (p.otayori) {
    for (const o of [p.otayori, p.otayoriNext].filter(Boolean)) {
      if (!o.url || !o.label || !o.month) problems.push(`${p.name}: otayori / otayoriNext に label・url・month がそろっていない`);
      if (LEAK.test(o.label || '')) problems.push(`${p.name}: おたよりの見出しに内部の話: ${o.label}`);
    }
    // 🆕 2026-11-28 今月号と来月号（月末は来月号も出す。月が替わると来月号が今月号に繰り上がる）
    const o = otayoriOf(p, todayJST);
    p._ota = o;
    if (!o.cur || o.cur.month < todayJST.slice(0, 7)) warn.push(`${p.name}: おたよりが ${o.cur ? o.cur.month : '無い'} のまま。今月号を足す（otayori / otayoriNext）`);
    if (+todayJST.slice(8, 10) >= 20 && !o.next) warn.push(`${p.name}: 来月号がまだ。出ていたら otayoriNext に足す（月末に来月の予定を知りたい人がいる）`);
  }
  if (p.note) for (const m of String(p.note).matchAll(/(\d{1,2})月(?:は|から|まで)/g)) { const back = (+todayJST.slice(5, 7) - +m[1] + 12) % 12; if (back >= 1 && back <= 6 && !/\d{4}年/.test(p.note)) warn.push(`${p.name}: note に過ぎた月の話（${m[0]}）`); }
  if (!p.otayori && daysBetween(p.checked, todayJST) > STALE_DAYS) warn.push(`${p.name}: 確かめてから ${daysBetween(p.checked, todayJST)} 日。公式を見直す`);
  for (const g of p.programs) {
    if (!agesOf(g.age).length || (Array.isArray(g.age) ? g.age : [g.age]).some((x) => !AGE_ALIAS[x])) problems.push(`${p.name}「${g.title}」: age は baby / pre / elem / kids / all（配列も可）`);
    // 🆕 2026-11-29 「10月は毎週水曜」のような、過ぎた月の一文を残さない（評価役の指摘）
    for (const s of [g.when, g.more, ...(g.notes || [])].filter(Boolean)) for (const m of String(s).matchAll(/(?<![〜~\d])(\d{1,2})月(?:は|の|中)/g)) {
      const mm = +m[1], cur = +todayJST.slice(5, 7), back = (cur - mm + 12) % 12;
      if (back >= 1 && back <= 6) warn.push(`${p.name}「${g.title}」: 過ぎた月の話が残っている（${m[0]}）: ${s}`);
    }
    for (const x of g.dates || []) {
      const d = asItem(x).d;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) problems.push(`${p.name}「${g.title}」: 日付の形がおかしい ${d}`);
    }
    const upcoming = (g.dates || []).map((x) => asItem(x).d).filter((d) => d >= todayJST);
    if (!g.when && !upcoming.length && !g.more) warn.push(`${p.name}「${g.title}」: これからの日が無い。公式で次を探すか、more に書く`);
  }
}
const { _about, ...pub } = data;
const allText = JSON.stringify(pub);
for (const m of allText.matchAll(new RegExp(LEAK, 'g'))) problems.push(`🔒 公開に出せない言葉: ${m[0]}`);
if (CONTACT.test(allText)) problems.push('🔒 個人の連絡先（携帯・メール）らしきものがある');
if (problems.length) {
  console.error('🔴 組めません:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ── 種類（地図のマスの色と、しぼるボタン）── 2026-11-28 オーナー「幼稚園マップみたいに四角のアイコンで。説明なしで分かるように」
const KIND = {
  lib: { icon: '📚', label: '図書館', cls: 'k-lib' },
  jidokan: { icon: '🏠', label: '児童館', cls: 'k-ji' },
  kodomo: { icon: '🧸', label: 'こども広場', cls: 'k-ko' },
  chiiki: { icon: '🚶', label: '出張こども広場', cls: 'k-sh' },
  hiroba: { icon: '☀️', label: '子育てひろば', cls: 'k-hi' },
};
for (const sec of data.sections) for (const p of sec.places) p._kind = KIND[sec.key] ? sec.key : 'chiiki';

// ── 地図（マス目）: 幼稚園マップと同じ外枠と駅。場所はおでかけマップのデータ（spots）から ──
const ENTEI = JSON.parse(readFileSync('data/entei.json', 'utf8')).map;
const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const spotOf = (p) => (p.spots || []).map((n) => SPOTS.find((x) => x.name === n)).find((x) => x && typeof x.lat === 'number');
const MC = 6, MR = 7;
const tnodes = [
  ...places.filter((p) => p.tile && spotOf(p)).map((p) => { const x = spotOf(p); return { id: p.key, w: 1, lat: x.lat, lon: x.lng, place: p, open: x.open || null }; }),
  ...ENTEI.stations.map((st, i) => ({ id: `st${i}`, w: 0.7, lat: st.lat, lon: st.lon, station: st })),
];
for (const p of places) if (p.tile && !spotOf(p)) warn.push(`${p.name}: 地図の位置が無い（spots をおでかけマップの名前に合わせる）`);
const tlay = layoutTiles({ cols: MC, rows: MR, bounds: ENTEI.bounds, ys: 0.55, nodes: tnodes });
if (tlay.tooMany) { console.error(`🔴 マスが足りない（${tnodes.length} > ${MC}×${MR}）`); process.exit(1); }
for (const id of tlay.outside) warn.push(`${id}: 地図の外枠の外`);
const tByCell = new Map([...tlay.at].map(([id, c]) => [c, tnodes.find((n) => n.id === id)]));
const tLabel = (s) => (s.length >= 5 ? `${esc(s.slice(0, Math.ceil(s.length / 2)))}<wbr>${esc(s.slice(Math.ceil(s.length / 2)))}` : esc(s));
// きょう開く日か（曜日の決まり）: 図書館などはおでかけマップと同じ決まり（open）。出張こども広場は「毎週月曜」「水曜と第1日曜」から
const DOWS = '日月火水木金土';
function openRule(p, sp) {
  if (sp && sp.open && sp.open.dows) return { dows: sp.open.dows, nth: sp.open.nth || [], closedNth: sp.open.closedNth || p.closedNth || [] };
  const w = (p.programs.find((g) => g.when) || {}).when || '';
  if (/^毎日/.test(w)) return { dows: [0, 1, 2, 3, 4, 5, 6], nth: [], closedNth: p.closedNth || [] };
  const m = w.match(/([月火水木金土日])(?:〜([月火水木金土日]))?曜(?:と第(\d)([月火水木金土日])曜)?/);
  if (!m) return null;
  const a = DOWS.indexOf(m[1]), b = DOWS.indexOf(m[2] || m[1]), dows = [];
  for (let i = a; ; i = (i + 1) % 7) { dows.push(i); if (i === b) break; }
  return { dows, nth: m[3] ? [[DOWS.indexOf(m[4]), +m[3]]] : [], closedNth: p.closedNth || [] };
}
// きょう開いているときに出す時間（毎日の会・決まった曜日の会の時間）
function openTime(p, sp) {
  const g = p.programs.find((x) => x.open === true && x.when && /\d{1,2}:\d{2}〜\d{1,2}:\d{2}/.test(x.when));
  const m = g && g.when.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
  if (m) return (p._kind === 'jidokan' ? 'こども広場 ' : '') + m[0];
  return (sp && sp.open && !sp.open.byDow && sp.open.time) || '';
}
function tileHtml(n) {
  if (!n) return '<span class="cell" aria-hidden="true"></span>';
  if (n.station) return `<span class="cell st" aria-hidden="true"><span>${tLabel(n.station.name.replace(/駅$/, ''))}<wbr>駅</span></span>`;
  const p = n.place, k = KIND[p._kind], rule = openRule(p, spotOf(p)), otime = openTime(p, spotOf(p));
  const dates = [...new Set(p.programs.filter((g) => g.open === true).flatMap((g) => (g.dates || []).map((x) => asItem(x).d)).filter((d) => d >= todayJST))].sort().slice(0, 40);
  return `<a class="cell tt ${k.cls}" href="#${p.key}" data-k="${p._kind}" data-ages="${[...new Set(p.programs.flatMap((g) => agesOf(g.age)))].join(' ')}"${rule ? ` data-rule="${esc(JSON.stringify(rule))}"` : ''}${dates.length ? ` data-dates="${dates.join(' ')}"` : ''}${otime ? ` data-time="${esc(otime)}"` : ''} data-name="${esc(p.tile)}" aria-label="${esc(k.label)}：${esc(p.name)}" data-goatcounter-click="定例マップ｜${esc(p.tile)}"><i aria-hidden="true">${k.icon}</i><b>${tLabel(p.tile)}</b></a>`;
}
const tmapHtml = `<div class="tmap">
      <div class="nb nb-top"><span>← ${esc(ENTEI.neighbors.w)}</span><span>↑ ${esc(ENTEI.neighbors.n)}</span><span>${esc(ENTEI.neighbors.e)} →</span></div>
      <div class="frame">
        <span class="frame-l">小平市</span>
        <div class="grid" style="--cols:${MC}">
          ${[...Array(MC * MR).keys()].map((c) => tileHtml(tByCell.get(c))).join('\n          ')}
        </div>
      </div>
      <div class="nb nb-bot"><span>↓ ${esc(ENTEI.neighbors.s)}</span></div>
    </div>`;
const CHIP = { lib: '図書館', jidokan: '児童館', kodomo: 'こども広場', chiiki: '出張', hiroba: 'ひろば' };
const kindChips = `<div class="kf" role="group" aria-label="種類でしぼる"><button type="button" data-k="" aria-pressed="true">すべて</button>${Object.entries(KIND).map(([k, v]) => `<button type="button" data-k="${k}" aria-pressed="false" class="${v.cls}" aria-label="${esc(v.label)}"><i aria-hidden="true">${v.icon}</i>${esc(CHIP[k])}</button>`).join('')}</div>`;

// ── 部品 ──────────────────────────────────────────────
const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapq || short(p.name))}`;
const fmtChecked = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;
const row = (k, v) => (v ? `<div class="kv"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : '');

function dateChips(g) {
  const items = (g.dates || []).map(asItem).filter((x) => x.d >= todayJST);
  if (!items.length) return '';
  const many = items.length > SHOW_CHIPS;
  return `<ul class="dates${items.some((x) => (x.t || '').length > 12) ? ' long' : ''}">${items
    .map((x) => `<li data-d="${x.d}"><b>${label(x.d)}</b>${x.t ? `<span>${esc(x.t)}</span>` : ''}</li>`)
    .join('')}</ul>${many ? '<button type="button" class="morebtn" hidden>ほかの日も見る</button>' : ''}`;
}

function program(g, p) {
  const tag = g.open === true
    ? '<span class="tag ok">予約なし</span>'
    : g.open === false ? '<span class="tag bk">申込み・登録</span>' : '';
  const gsrc = publicUrl(g.src); // 市のサイトの障害の間は、開かない出典を出さない
  const src = gsrc && gsrc !== p.url ? `<a class="src" href="${esc(gsrc)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜${esc(g.title)}">この会の案内（公式）</a>` : '';
  return `<div class="prog" data-age="${agesOf(g.age).join(' ')}">
        <h3>${esc(g.title)} <span class="agetag">${ageLabel(g.age)}</span> ${tag}</h3>
        ${g.when ? `<p class="when">${esc(g.when)}</p>` : ''}
        ${dateChips(g)}
        ${g.more ? `<p class="more">${esc(g.more)}</p>` : ''}
        ${!g.when ? `<p class="more done" hidden>ここに出ている日は終わりました。次の日程は公式で。</p>` : ''}
        <div class="kvs">
          ${row('時間', g.time)}
          ${row('場所', g.place)}
          ${row('対象', g.who)}
          ${row('定員', g.cap)}
          ${row('費用', g.cost)}
          ${row('予約', g.book ?? '公式に予約の案内はありません')}
        </div>
        ${(g.notes || []).length ? `<ul class="notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${src}
      </div>`;
}

function place(p) {
  const ages = [...new Set(p.programs.flatMap((g) => agesOf(g.age)))].join(' ');
  const k = KIND[p._kind] || KIND.chiiki;
  const wh = (p.programs.find((g) => g.when) || {}).when || '';
  return `<details class="pl" id="${p.key}" data-ages="${ages || AGE_KEYS.join(' ')}" data-k="${p._kind}">
      <summary class="pl-s"><span class="pl-i ${k.cls}" aria-hidden="true">${k.icon}</span><span class="pl-n"><b>${esc(p.name)}</b><small class="pl-next" data-wh="${esc(wh)}">${esc(wh || (p.town || ''))}</small></span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pl-b">
      ${p.town ? `<p class="town">${esc(p.town)}</p>` : ''}
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      ${p._ota && p._ota.cur ? `<a class="ota" href="${esc(p._ota.cur.url)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜おたより">📄 ${esc(p._ota.cur.label)}<span>月ごとの催しは、ここに出ます</span></a>` : ''}
      ${p._ota && p._ota.next ? `<a class="ota nx" href="${esc(p._ota.next.url)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜来月のおたより">📄 ${esc(p._ota.next.label)}<span>来月号も出ています</span></a>` : ''}
      ${p.note ? `<p class="more">${esc(p.note)}</p>` : ''}
      ${p.programs.map((g) => program(g, p)).join('\n      ')}
      ${p.footnote ? `<p class="fn">${esc(p.footnote)}</p>` : ''}
      <div class="pl-f">
        <span class="chk">${fmtChecked(p.checked)}に、公式で確かめました</span>
        <span class="acts">
          ${p.otayoriList ? `<a class="lk" href="${esc(p.otayoriList)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜これまでのおたより">これまでのおたより</a>` : ''}
          ${publicUrl(p.url) && ![p.otayori, p.otayoriNext].some((o) => o && o.url === publicUrl(p.url)) ? `<a class="lk" href="${esc(publicUrl(p.url))}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜公式">公式</a>` : ''}
          ${p.spots ? `<a class="lk" href="/map.html#${spotSlug(p.spots[0])}" data-goatcounter-click="定例｜${esc(short(p.name))}｜マップ">おでかけマップ</a>` : ''}
          <a class="lk" href="${mapUrl(p)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜地図">Googleマップ</a>
          <a class="lk up" href="#tmap-h">↑ 地図へ</a>
        </span>
      </div>
      </div>
    </details>`;
}

// 「これから2週間」：予約なしで行ける・日付のあるもの（申込みのいるものは除く）
const soon = [];
for (const p of places) {
  for (const g of p.programs) {
    if (g.open !== true) continue;
    for (const x of (g.dates || []).map(asItem)) {
      if (x.d < todayJST) continue;
      const tm = (g.timeByDow && g.timeByDow[dow(x.d)]) || g.time || '';
      soon.push({ d: x.d, key: p.key, pl: p._kind === 'chiiki' && p.tile && !p.short ? `出張こども広場・${p.tile}` : shortOf(p), t: x.t || g.title, time: x.t && /\d{1,2}:\d{2}/.test(x.t) ? '' : tm, age: agesOf(g.age).join(' '), k: p._kind });
    }
  }
}
soon.sort((a, b) => a.d.localeCompare(b.d) || a.pl.localeCompare(b.pl, 'ja'));
const byDate = new Map();
for (const s of soon) byDate.set(s.d, [...(byDate.get(s.d) || []), s]);
const soonHtml = [...byDate]
  .map(([d, xs]) => `<li class="day" data-d="${d}"><span class="sd">${label(d)}</span><ul>${xs
    .map((x) => `<li data-age="${x.age}" data-k="${x.k}"><a href="#${x.key}"><i class="sk ${KIND[x.k].cls}" aria-hidden="true">${KIND[x.k].icon}</i><span><b>${esc(x.pl)}</b> ${esc(x.t.replace(/[（(][^）)]{16,}[）)]/g, ''))}${x.time ? `<small>${esc(x.time)}</small>` : ''}</span></a></li>`)
    .join('')}</ul></li>`)
  .join('\n        ');

const regular = [];
for (const p of places) for (const g of p.programs) if (g.open === true && g.when) regular.push({ key: p.key, pl: shortOf(p), t: g.title, when: g.when, age: agesOf(g.age).join(' ') });
const regularHtml = regular
  .map((x) => `<li data-age="${x.age}"><a href="#${x.key}">${esc(x.pl)}</a> ${esc(x.t)}<small>${esc(x.when)}</small></li>`)
  .join('\n        ');

const title = '児童館・図書館・こども広場（小平）';
const desc = '小平市の児童館・図書館・こども広場・出張こども広場・子育てひろばを地図に。予約なしで行ける会の日程と、各館のおたより。';

// 🆕 2026-11-01 ページの上に「今月のおたより」。月ごとの催しは、館のおたよりがいちばん新しい（こども若者みらい課の提案）
const otaSeen = new Set();
const otaPlaces = places.filter((p) => p._ota && p._ota.cur && !otaSeen.has(p._ota.cur.url) && otaSeen.add(p._ota.cur.url));
const nextSeen = new Set();
const nextPlaces = places.filter((p) => p._ota && p._ota.next && !nextSeen.has(p._ota.next.url) && nextSeen.add(p._ota.next.url));
// おたよりは1行ずつ: 「はなみん ［11月号］［12月号］」（月末は来月号も並ぶ）
const otaRow = (p) => `<li><span class="on"><i aria-hidden="true">${KIND[p._kind].icon}</i>${esc(p.otaName || p.tile || p.short || short(p.name))}</span>${[p._ota.cur, p._ota.next].filter(Boolean)
  .map((o, i) => `<a href="${esc(o.url)}" target="_blank" rel="noopener" data-goatcounter-click="定例｜${esc(short(p.name))}｜${i ? '来月のおたより' : 'おたより'}（上）"${i ? ' class="nx"' : ''}>${esc((o.label.match(/\d{1,2}月号/) || [o.label])[0])}${i ? '<small>来月</small>' : ''}</a>`).join('')}</li>`;
const otaStrip = otaPlaces.length
  ? `<details class="otas" id="otas">
    <summary><h2 id="otas-h">📄 各館のおたより<small>${otaPlaces.length}か所${nextPlaces.length ? '・来月号も' : ''}</small></h2><span class="chev" aria-hidden="true"></span></summary>
    <ul>${otaPlaces.map(otaRow).join('')}</ul>
  </details>`
  : '';

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/teirei.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/teirei.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="ja_JP">
<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  main { padding: 1.2rem 0 1rem; }
  .ghead-in { padding-top: 1.1rem; padding-bottom: .9rem; }
  .ghead h1 { font-size: clamp(1.45rem, 4.8vw, 2rem); margin-bottom: .35rem; }
  .ghead .sub { font-size: .92rem; line-height: 1.75; }
  .lead { color: var(--ink-soft); font-size: .86rem; line-height: 1.75; margin-bottom: 1rem; }
  h2.sec { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; margin: 1.8rem 0 .4rem; }
  .sec-lead { color: var(--ink-soft); font-size: .84rem; line-height: 1.7; margin-bottom: .8rem; }

  /* 年齢でしぼる */
  .agef { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; margin: 0 0 .45rem; }
  .agef button { font-family: var(--maru); font-weight: 700; font-size: .8rem; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); border-radius: 999px; padding: .2rem .3rem; min-height: 36px; cursor: pointer; white-space: nowrap; }
  .agef button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }

  /* これから2週間 */
  .soon { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: .9rem 1rem; }
  .soon h3 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0 0 .45rem; color: var(--sky-deep); }
  .soon > ul { list-style: none; margin: 0 0 .9rem; padding: 0; }
  .soon .day { display: grid; grid-template-columns: 4.7em 1fr; gap: .6rem; padding: .45rem 0; border-top: 1px dashed var(--line); }
  .soon .day:first-child { border-top: 0; }
  .soon .sd { font-family: var(--maru); font-weight: 800; font-size: .88rem; }
  .soon .day ul, .soon .reg { list-style: none; margin: 0; padding: 0; }
  .soon .day li, .soon .reg li { font-size: .84rem; line-height: 1.55; padding: .1rem 0; }
  .soon .reg li { padding: .35rem 0; border-top: 1px dashed var(--line); }
  .soon .reg li:first-child { border-top: 0; }
  .soon a { font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .soon .day li a { display: flex; align-items: flex-start; gap: .45rem; min-height: 44px; padding: .35rem .2rem; color: var(--ink); font-weight: 400; border-radius: 8px; }
  .soon .day li a:hover, .soon .day li a:focus-visible { background: var(--sky-wash); }
  .soon .day li a b { color: var(--link-ink); font-weight: 800; }
  .soon .sk { flex: 0 0 auto; font-style: normal; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--c); font-size: 12px; margin-top: 1px; }
  .soon .day { align-items: start; }
  .soon .sd { padding-top: .45rem; }
  .soon small { display: block; color: var(--ink-faint); font-size: .74rem; }
  .soon .empty, .soon .wk { color: var(--ink-faint); font-size: .78rem; }
  .soon .tdy .sd { color: #C2410C; }
  .soon .tdy li a b { white-space: normal; }
  .soon .tdy .nm { display: inline; }

  /* 今月のおたより */
  .otas { margin: 0 0 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .9rem 1rem; }
  .otas h3 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0 0 .5rem; color: var(--sky-deep); }
  .otas ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: .45rem; }
  .otas a { display: flex; flex-direction: column; justify-content: center; min-height: 48px; padding: .45rem .75rem; border: 1px solid var(--line-strong); border-radius: 10px; font-weight: 700; font-size: .86rem; color: var(--link-ink); text-decoration: none; background: var(--surface); }
  .otas small { color: var(--ink-faint); font-weight: 400; font-size: .72rem; line-height: 1.4; }
  .otas .wk { color: var(--ink-faint); font-size: .76rem; line-height: 1.6; margin: .55rem 0 0; }
  .ota { display: flex; flex-direction: column; gap: .1rem; margin: .5rem 0 .7rem; padding: .6rem .85rem; min-height: 48px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); color: var(--link-ink); font-weight: 700; font-size: .9rem; text-decoration: none; }
  .ota span { color: var(--ink-faint); font-weight: 400; font-size: .74rem; }
  .ota.nx { margin-top: -.3rem; border-style: dashed; }
  .ota.nx span { color: var(--marigold-ink); font-weight: 700; }
  .otas .nx-h { margin-top: .8rem; color: var(--marigold-ink); }

  /* 目次 */
  .idx { display: flex; flex-wrap: wrap; gap: .35rem; margin: 1rem 0 0; }
  .idx a { font-size: .8rem; font-weight: 700; text-decoration: none; color: var(--link-ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .3rem .75rem; }

  /* 施設ごと */
  .pl { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: 1rem 1.05rem .8rem; margin-bottom: .6rem; scroll-margin-top: 110px; }
  .pl-h { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .pl h2 { font-family: var(--maru); font-weight: 800; font-size: 1.04rem; margin: 0; line-height: 1.4; }
  .town { font-size: .78rem; color: var(--ink-faint); }
  .intro { font-size: .84rem; color: var(--ink-soft); margin-top: .35rem; line-height: 1.7; }
  .prog { margin-top: .8rem; padding-top: .7rem; border-top: 1px solid var(--line); }
  .pl > .prog:first-of-type { border-top: 0; padding-top: 0; }
  .prog h3 { font-family: var(--maru); font-weight: 800; font-size: .94rem; margin: 0 0 .35rem; line-height: 1.5; }
  .tag, .agetag { display: inline-block; font-size: .64rem; font-weight: 700; border-radius: 999px; padding: .05rem .5rem; vertical-align: .12em; margin-left: .15rem; white-space: nowrap; }
  .agetag { background: var(--surface-2); color: var(--ink-soft); }
  .tag.ok { background: var(--sky-wash); color: var(--sky-deep); }
  .tag.bk { background: var(--marigold-wash); color: var(--marigold-ink); }
  .when { font-size: .88rem; font-weight: 700; margin-bottom: .3rem; }
  .dates { list-style: none; margin: 0 0 .45rem; padding: 0; display: flex; flex-wrap: wrap; gap: .3rem; }
  .dates.long { flex-direction: column; }
  .dates li { font-size: .8rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: .1rem .45rem; line-height: 1.6; }
  .dates li b { font-family: var(--maru); }
  .dates li span { margin-left: .35rem; color: var(--ink-soft); }
  .morebtn { font-size: .76rem; font-weight: 700; color: var(--link-ink); background: none; border: 0; padding: .2rem 0 .5rem; cursor: pointer; min-height: 32px; }
  .more { font-size: .82rem; color: var(--ink-soft); background: var(--surface-2); border-radius: 8px; padding: .35rem .6rem; margin: .4rem 0 .45rem; line-height: 1.65; }
  .kvs { display: grid; gap: .12rem; }
  .kv { display: flex; gap: .6rem; font-size: .84rem; line-height: 1.6; }
  .kv .k { flex: none; width: 3.6em; color: var(--ink-faint); font-size: .78rem; padding-top: .08rem; }
  .notes { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .8rem; color: var(--ink-soft); line-height: 1.65; }
  .src { display: inline-flex; align-items: center; min-height: 44px; font-size: .76rem; font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .fn { font-size: .78rem; color: var(--ink-faint); margin-top: .6rem; line-height: 1.6; }
  .pl-f { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .6rem; margin-top: .7rem; padding-top: .5rem; border-top: 1px solid var(--line); }
  .chk { font-size: .72rem; color: var(--ink-faint); }
  .acts { margin-left: auto; display: flex; flex-wrap: wrap; gap: .35rem; }
  .lk { display: inline-flex; align-items: center; min-height: 36px; font-size: .78rem; font-weight: 700; text-decoration: none; color: var(--link-ink); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .85rem; background: var(--surface); white-space: nowrap; }

  .tips { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .9rem 1.1rem; }
  .tips ul { margin: 0; padding-left: 1.1rem; font-size: .86rem; line-height: 1.75; }
  .tips li + li { margin-top: .25rem; }
  .about { font-size: .82rem; color: var(--ink-soft); line-height: 1.8; margin-top: 1.4rem; }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.6rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }
  [hidden] { display: none !important; }

  /* ── 地図（マス目）── 幼稚園マップと同じ作り。色と絵で種類が分かる */
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .tsec { margin: 0 0 1rem; scroll-margin-top: 110px; }
  #tmap-h { scroll-margin-top: 110px; }
  .kf { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0 0 .7rem; }
  .kf button { display: inline-flex; align-items: center; gap: .2rem; min-height: 44px; padding: .2rem .6rem; border-radius: 999px; border: 1.5px solid var(--line-strong);
    background: var(--surface); color: var(--ink); font: 700 .8rem/1.2 var(--body); cursor: pointer; }
  .kf button i { font-style: normal; }
  .kf button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--ground); }
  .tmap { margin: 0 0 .3rem; }
  .nb { display: flex; justify-content: space-between; gap: .5rem; font-size: .68rem; color: var(--ink-faint); line-height: 1.4; }
  .nb-top { margin-bottom: .45rem; } .nb-bot { justify-content: center; margin-top: .3rem; }
  .frame { position: relative; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--surface-2); padding: .55rem .4rem .45rem; }
  .frame-l { position: absolute; top: -.75em; left: .8rem; background: var(--ground); padding: 0 .4rem; font-family: var(--maru); font-weight: 800; font-size: .76rem; color: var(--ink-soft); line-height: 1.4; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 5px; }
  .cell { min-height: 50px; border-radius: 9px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3px 2px; line-height: 1.15; position: relative; }
  .tt { --c: var(--sky); background: var(--surface); border: 2px solid var(--c); box-shadow: 0 1px 0 var(--line-strong); text-decoration: none; color: var(--ink); }
  .tt i { font-style: normal; font-size: 15px; line-height: 1; }
  .tt b { font-family: var(--maru); font-weight: 800; font-size: clamp(11.5px, 3.2vw, 13.5px); letter-spacing: -.03em; word-break: keep-all; margin-top: 2px; }
  .tt:hover, .tt:focus-visible { background: var(--sky-wash); }
  .tt.off { opacity: .45; }
  .tt.today::after { content: "きょう"; position: absolute; top: -7px; right: -3px; font: 800 9px/1 var(--body); color: #fff; background: #C2410C; border-radius: 999px; padding: 2px 4px; }
  .tt.dim { opacity: .18; pointer-events: none; }
  .k-lib { --c: #2563EB; } .k-ji { --c: #BE185D; } .k-ko { --c: #2F7D3A; } .k-sh { --c: #2F7D3A; border-style: dashed !important; } .k-hi { --c: #C2410C; }
  .kf button.k-lib, .kf button.k-ji, .kf button.k-ko, .kf button.k-sh, .kf button.k-hi { border-color: var(--c); }
  .kf button.k-sh { border-style: dashed; }
  .st { border: 1px dashed var(--ink-faint); color: var(--ink-soft); font-size: clamp(10px, 2.9vw, 11.5px); letter-spacing: -.05em; line-height: 1.1; word-break: keep-all; overflow: hidden; }
  .tleg { font-size: .72rem; color: var(--ink-soft); margin: .45rem 0 0; }
  .lg-today { font-weight: 800; color: #fff; background: #C2410C; border-radius: 999px; padding: 1px 5px; font-size: .66rem; }
  .lg-off { opacity: .5; font-weight: 700; border: 1px solid var(--line-strong); border-radius: 4px; padding: 0 4px; }
  .pl:target { box-shadow: 0 0 0 3px var(--sky), var(--shadow-soft); }
  details.pl { padding: 0; }
  .pl-s { display: flex; align-items: center; gap: .6rem; min-height: 56px; padding: .55rem .9rem; cursor: pointer; list-style: none; }
  .pl-s::-webkit-details-marker { display: none; }
  .pl-i { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 2px solid var(--c); font-size: 16px; }
  .pl-n { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .pl-n b { font-family: var(--maru); font-weight: 800; font-size: .98rem; line-height: 1.35; }
  .pl-n small { font-size: .76rem; color: var(--ink-soft); line-height: 1.45; }
  .pl-n small.td { color: #C2410C; font-weight: 800; }
  .chev { flex: 0 0 auto; width: 10px; height: 10px; border-right: 2px solid var(--ink-faint); border-bottom: 2px solid var(--ink-faint); transform: rotate(45deg); margin: -4px 4px 0 0; transition: transform .15s; }
  details[open] > .pl-s .chev { transform: rotate(225deg); margin-top: 4px; }
  .pl-b { padding: 0 1.05rem .8rem; }
  .pl-b .town { margin: 0; }
  .sec i { font-style: normal; margin-right: .25rem; }
  .lk.up { color: var(--ink-soft); }
  .agef button, .lk { min-height: 44px !important; }
  .morebtn { min-height: 44px !important; }
  .otas h2 { font-family: var(--maru); font-weight: 800; font-size: .92rem; margin: 0; color: var(--sky-deep); flex: 1 1 auto; }
  .otas h2 small { margin-left: .5rem; font-size: .74rem; font-weight: 700; color: var(--ink-soft); }
  .otas summary { display: flex; align-items: center; gap: .5rem; min-height: 44px; cursor: pointer; list-style: none; }
  .otas summary::-webkit-details-marker { display: none; }
  .otas[open] summary { margin-bottom: .3rem; }
  details.otas[open] > summary .chev { transform: rotate(225deg); margin-top: 4px; }
  .otas ul { display: block !important; }
  .otas li { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .4rem; padding: .25rem 0; border-top: 1px dashed var(--line); }
  .otas li:first-child { border-top: 0; }
  .otas .on { flex: 0 0 7.4em; font-weight: 800; font-size: .8rem; line-height: 1.35; }
  .otas .on i { font-style: normal; margin-right: .2rem; }
  @media (min-width: 480px) { .otas .on { flex: 0 0 9em; } }
  .otas li a { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: .25rem; min-height: 44px !important; padding: .2rem .7rem !important; border-radius: 999px !important; font-size: .8rem !important; }
  .otas li a.nx { border-style: dashed !important; color: var(--marigold-ink); }
  .otas li a small { font-size: .66rem; font-weight: 800; }
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
${navSub('teirei')}
</nav>
<header class="ghead">
  <div class="ghead-in">
    <h1>児童館・図書館・こども広場</h1>
    <p class="sub">小平市内、ぜんぶ無料。四角を押すと、その場所の会とおたよりへ。</p>
  </div>
</header>

<main class="wrap">
  <section class="tsec" aria-labelledby="tmap-h">
    <h2 class="vh" id="tmap-h">地図</h2>
    <div class="agef" role="group" aria-label="年齢でしぼる">
      <button type="button" data-f="" aria-pressed="true">全年齢</button>
      <button type="button" data-f="baby" aria-pressed="false">👶 0〜3歳</button>
      <button type="button" data-f="pre" aria-pressed="false">🧒 4〜6歳</button>
      <button type="button" data-f="elem" aria-pressed="false">🎒 小学生</button>
    </div>
    ${kindChips}
    ${tmapHtml}
    <p class="tleg"><span class="lg-today">きょう</span>＝きょう会がある　<span class="lg-off">うすい</span>＝きょうはお休みの日</p>
  </section>


  <section class="soon" aria-labelledby="soon-h">
    <h3 id="soon-h">📅 予約なしで行ける会</h3>
    <ul id="soon">
        <li class="day tdy" id="today-row" hidden><span class="sd" id="today-d">きょう</span><ul id="today-ul"></ul></li>
        ${soonHtml}
    </ul>
    <button type="button" class="morebtn" id="soon-more" hidden>2週間ぶんを見る</button>
    <p class="empty" id="soon-empty" hidden>この2週間に、この条件の日付つきの会は見つかっていません。地図の四角から、決まった曜日にひらく所をご覧ください。</p>
  </section>

  ${otaStrip}

  ${data.sections
    .map((s) => `<div class="secw" data-k="${KIND[s.key] ? s.key : 'chiiki'}"><h2 class="sec" id="sec-${s.key}">${KIND[s.key] ? `<i aria-hidden="true">${KIND[s.key].icon}</i>` : ''}${esc(s.title)}</h2>
  <p class="sec-lead">${esc(s.lead)}</p>
  ${s.places.map(place).join('\n  ')}</div>`)
    .join('\n\n  ')}

  <p class="lead">公民館の子ども向けの講座は、回ごとに日にちが決まっているので、<a href="/calendar.html">おでかけカレンダー</a>の「🏛 公民館・児童館」にのせています。</p>

  <h2 class="sec">行く前に</h2>
  <div class="tips">
    <ul>
      <li>児童館・図書館には駐車場がありません。歩き・自転車・バスで。</li>
      <li>おはなし会は、途中からは入れません。少し早めに。</li>
      <li>子育てひろばのプログラムと出張ひろばは、小平市在住の方が対象です。</li>
    </ul>
  </div>

  <p class="about">日程は各施設の公式の案内（ホームページ・おたより・年間の予定表・市の「こどもあそびマップ」）で確かめています。行事や天候で変わることがあるので、出かける前に各施設の案内でご確認ください。<br>
  内容のまちがいに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/entei.html">こだいら幼稚園だより（幼稚園・こども園）</a>
    <a href="/map.html">おでかけマップ</a>
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
(function () {
  var SHOW = ${SHOW_CHIPS};
  var t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  var lim = new Date(Date.now() + 9 * 3600e3 + 13 * 864e5).toISOString().slice(0, 10);
  var age = '';
  try { age = localStorage.getItem('bvt.age') || ''; } catch (e) {}
  if (['', 'baby', 'pre', 'elem'].indexOf(age) < 0) age = '';

  // 過ぎた日を隠し、先の SHOW 回だけ見せる
  document.querySelectorAll('.prog').forEach(function (g) {
    var ul = g.querySelector('.dates');
    if (!ul) return;
    var left = [];
    ul.querySelectorAll('li[data-d]').forEach(function (li) {
      if (li.getAttribute('data-d') < t) li.hidden = true; else left.push(li);
    });
    var done = g.querySelector('.done');
    if (!left.length) { ul.hidden = true; if (done && !g.querySelector('.more:not(.done)')) done.hidden = false; return; }
    var btn = g.querySelector('.morebtn');
    if (left.length > SHOW && btn) {
      left.slice(SHOW).forEach(function (li) { li.hidden = true; li.classList.add('later'); });
      btn.hidden = false;
      btn.addEventListener('click', function () {
        ul.querySelectorAll('li.later').forEach(function (li) { li.hidden = false; });
        btn.hidden = true;
      });
    } else if (btn) btn.hidden = true;
  });

  // 地図のマス: きょう会がある所に「きょう」、きょうが休みの曜日の所は薄く
  var now = new Date(Date.now() + 9 * 3600e3), dw = now.getUTCDay(), nth = Math.ceil(now.getUTCDate() / 7);
  document.querySelectorAll('.tt').forEach(function (a) {
    var ds = (a.getAttribute('data-dates') || '').split(' ');
    if (ds.indexOf(t) >= 0) a.classList.add('today');
    var r = a.getAttribute('data-rule');
    if (r) {
      try {
        r = JSON.parse(r);
        var on = r.dows.indexOf(dw) >= 0 || (r.nth || []).some(function (x) { return x[0] === dw && x[1] === nth; });
        if ((r.closedNth || []).some(function (x) { return x[0] === dw && x[1] === nth; })) on = false;
        if (!on && !a.classList.contains('today')) { a.classList.add('off'); a.setAttribute('aria-label', a.getAttribute('aria-label') + '（きょうはお休みの日）'); }
      } catch (e) { /* なし */ }
    }
  });
  // きょう開いている所（種類ごとに1行。会のある日付つきの行は、この下に続く）
  var WDJ = ['日', '月', '火', '水', '木', '金', '土'];
  var KN = { lib: ['📚', '図書館', 'k-lib'], jidokan: ['🏠', '児童館', 'k-ji'], kodomo: ['🧸', 'こども広場', 'k-ko'], chiiki: ['🚶', '出張こども広場', 'k-sh'], hiroba: ['☀️', '子育てひろば', 'k-hi'] };
  var openNow = {};
  (function () {
    var by = {};
    document.querySelectorAll('.tt[data-rule]').forEach(function (a) {
      if (a.classList.contains('off')) return;
      openNow[a.getAttribute('href').slice(1)] = a.getAttribute('data-time') || '';
      var k = a.getAttribute('data-k'); (by[k] = by[k] || []).push(a);
    });
    var ul = document.getElementById('today-ul'), html = '';
    ['jidokan', 'kodomo', 'chiiki', 'hiroba', 'lib'].forEach(function (k) {
      var xs = by[k]; if (!xs || !xs.length) return;
      var times = xs.map(function (a) { return a.getAttribute('data-time') || ''; }), cnt = {};
      times.forEach(function (x) { if (x) cnt[x] = (cnt[x] || 0) + 1; });
      var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
      var same = top && times.every(function (x) { return x; }) ? top + xs.filter(function (a, i) { return times[i] !== top; }).map(function (a, i, arr) { return (i ? '' : '（') + a.getAttribute('data-name') + 'は ' + a.getAttribute('data-time') + (i === arr.length - 1 ? '）' : '、'); }).join('') : '';
      html += '<li data-age="' + (k === 'lib' || k === 'kodomo' || k === 'chiiki' ? 'baby pre elem' : (k === 'jidokan' ? 'baby pre elem' : 'baby')) + '" data-k="' + k + '"><a href="' + xs[0].getAttribute('href') + '"><i class="sk ' + KN[k][2] + '" aria-hidden="true">' + KN[k][0] + '</i><span><b>' + KN[k][1] + '</b> ' +
        xs.map(function (a) { return a.getAttribute('data-name'); }).join('・') + '<small>ひらいています' + (same ? '　' + same : '（時間は四角を押して）') + '</small></span></a></li>';
    });
    if (html) {
      ul.innerHTML = html;
      document.getElementById('today-d').textContent = 'きょう ' + (+t.slice(5, 7)) + '/' + (+t.slice(8)) + '(' + WDJ[dw] + ')';
      document.getElementById('today-row').setAttribute('data-d', t);
    }
  })();
  // たたんだ欄の1行目: きょう開いていれば、きょうの時間。続けて次の会（予約なしで行ける日）
  document.querySelectorAll('details.pl').forEach(function (d) {
    var li = [].slice.call(d.querySelectorAll('.prog .dates li[data-d]')).filter(function (x) { return x.getAttribute('data-d') >= t && !x.closest('.prog').querySelector('.tag.bk'); })
      .sort(function (a, b) { return a.getAttribute('data-d').localeCompare(b.getAttribute('data-d')); })[0];
    var sm = d.querySelector('.pl-next'); if (!sm) return;
    var on = Object.prototype.hasOwnProperty.call(openNow, d.id), ot = on ? openNow[d.id] : '';
    if (!li) { if (on) { sm.textContent = 'きょう ひらいています' + (ot ? ' ' + ot : ''); sm.classList.add('td'); } return; }
    var iso = li.getAttribute('data-d'), dd = new Date(iso + 'T00:00:00Z');
    var what = (li.querySelector('span') || {}).textContent || li.closest('.prog').querySelector('h3').firstChild.textContent;
    var nx = (+iso.slice(5, 7)) + '/' + (+iso.slice(8)) + '(' + WDJ[dd.getUTCDay()] + ') ' + what.trim().replace(/\s*[（(].*$/, '').slice(0, 24);
    sm.textContent = iso === t ? 'きょう ' + nx.replace(/^\S+ /, '') : (on ? 'きょう ひらいています' + (ot ? ' ' + ot : '') + '・次は ' + nx : '次は ' + nx);
    if (iso === t || on) sm.classList.add('td');
  });
  // 地図のマスを押したら、その欄を開く
  function openHash() {
    var id = decodeURIComponent((location.hash || '').slice(1)), el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') { el.open = true; var w = el.closest('.secw'); if (w && w.hidden) { kind = ''; apply(); } setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0); }
  }
  window.addEventListener('hashchange', openHash);
  var kind = '', soonAll = false;
  function apply() {
    var ok = function (a) { return !age || (a || '').split(' ').indexOf(age) >= 0; };
    document.querySelectorAll('.tt').forEach(function (a) {
      var ags = (a.getAttribute('data-ages') || '').split(' ');
      var hit = (!kind || a.getAttribute('data-k') === kind) && (!age || ags.indexOf(age) >= 0);
      a.classList.toggle('dim', !hit);
    });
    document.querySelectorAll('.secw').forEach(function (w) { w.hidden = !!kind && w.getAttribute('data-k') !== kind; });
    document.querySelectorAll('.kf button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === kind)); });
    var shown = 0;
    var days = 0;
    document.querySelectorAll('#soon .day').forEach(function (day) {
      var d = day.getAttribute('data-d'), n = 0;
      day.querySelectorAll('li[data-age]').forEach(function (li) {
        var on = ok(li.getAttribute('data-age')) && (!kind || li.getAttribute('data-k') === kind); li.hidden = !on; if (on) n++;
      });
      var vis = d >= t && d <= lim && n > 0;
      if (vis) days++;
      day.hidden = !vis || (!soonAll && days > 4); if (vis) shown++;
    });
    document.getElementById('soon-more').hidden = soonAll || days <= 4;
    document.getElementById('soon-empty').hidden = shown > 0;
    document.querySelectorAll('.reg li[data-age], .prog[data-age]').forEach(function (el) {
      el.hidden = !ok(el.getAttribute('data-age'));
    });
    document.querySelectorAll('.pl').forEach(function (pl) {
      var any = pl.querySelectorAll('.prog:not([hidden])').length;
      pl.hidden = !!age && pl.querySelectorAll('.prog').length > 0 && !any;
    });
    document.querySelectorAll('.agef button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === age));
    });
  }
  document.querySelectorAll('.agef button').forEach(function (b) {
    b.addEventListener('click', function () {
      age = b.getAttribute('data-f');
      try { localStorage.setItem('bvt.age', age); } catch (e) {}
      apply();
    });
  });
  document.querySelectorAll('.kf button').forEach(function (b) {
    b.addEventListener('click', function () { kind = b.getAttribute('data-k'); apply(); });
  });
  document.getElementById('soon-more').addEventListener('click', function () { soonAll = true; apply(); });
  apply();
  openHash();
})();
</script>
</body>
</html>
`;

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const leak = visible.match(LEAK);
if (leak) {
  console.error(`🔴 公開ページに出せない言葉が入りました: ${leak[0]}`);
  process.exit(1);
}

writeFileSync(OUT, html);
console.log(`wrote ${OUT}（${places.length}か所 / 予約なしで行ける日 ${soon.length}件・決まった曜日 ${regular.length}件）`);
for (const w of warn) console.log('  🔴 ' + w);
