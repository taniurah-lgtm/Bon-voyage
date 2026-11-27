#!/usr/bin/env node
/*
 * スクールガイド（2026-11-23 オーナー決定・docs/sponsor-plan.md §16。はじめの名前は「習い事ガイド」）を data/lessons.json から組む。
 *
 *   node scripts/build-lessons.mjs                 … launch が true のときだけ docs/homepage/school.html を書く（確かめた教室だけ）
 *   node scripts/build-lessons.mjs --preview <出力> … 確認用。確認中の教室（「確認中」の札）と、営業の見本のPRカード（「見本」の札）も入れる
 *
 * 🔁 2026-11-27 オーナー「事実は無料で全部載せ、PRカードは有料」の形の準備（公開は 12/2 の打合せのあと決める・§16）:
 *   - facts（kind: "fact"）= 教室の公式に書いてある事実だけ（名前・ジャンル・対象・場所の町名・体験の有無・公式リンク）。無料・ずっと無料
 *   - lessons（kind: "pr"）= 掲載料をいただいた教室のくわしいカード。カードごとに「PR」（編集と広告が混ざるページなので、週の号と同じく1件ずつ）
 *   - 並びは PR も事実も混ぜて、ジャンルごとの五十音。払った額で順番を変えない
 *   - 載せてほしくない教室は、言われたらすぐ外す（ページに書く）
 *
 * 🔁 2026-11-27 オーナー「コドモブースターのページより見やすくなるまで検討して。PRのイメージもあった方がいい」→ 組み方を作り直した:
 *   - 上に「さがす」の枠: 年齢（4つの切りかえ）・ジャンル（絵のついた10のボタン）・駅（町の位置から近い駅も）・無料体験だけ。組み合わせてしぼれる。数は条件に合わせて変わる
 *   - 無料の欄は、1教室2〜3行の一覧（教室のページへのリンク）。86教室を指で流して見られる長さにした
 *   - 「教室の案内に書いてあることです（日付）」はカードごとに書かず、上に1回だけ
 *   - PRカードは開いた形で、写真（3枚まで）・教室のひとこと・曜日・費用・体験・空き・通信の読者への特典・申込みのボタン
 *   - 見本の写真は絵（写真のイメージ）。本番は教室からいただいた写真だけ
 *   - 口コミ・星・ランキングは載せない（ないものを作らない。比べる言葉は止める）
 *
 * 決まり（§16・11/23。11/27 の形では「載せるのは掲載料をいただいた教室だけ」「見出しに PR」が変わる）:
 *   - 書くのは公式か、教室からいただいた事実だけ。「おすすめ」「No.1」など比べる言葉は書かない（止める）
 *   - 場所は町名と駅まで（自宅の教室があるので、番地と地図は無料の欄に出さない。PRは教室が出してよいと言った範囲）
 *   - 公開は min_launch（5）教室そろってから
 *   - LINE本文には載せない・リンクもしない（このページはホームページの中だけ）
 */
import { navSub } from './lib/nav.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/lessons.json';
const OUT = 'docs/homepage/school.html';
const SITE = 'https://bonvoya.nicomaru.tokyo';
const LINE_URL = 'https://lin.ee/YtcfjnX';

const args = process.argv.slice(2);
const pi = args.indexOf('--preview');
const PREVIEW = pi >= 0 ? args[pi + 1] : null;
if (pi >= 0 && !PREVIEW) { console.error('--preview のあとに出力先を書いてください'); process.exit(1); }

const data = JSON.parse(readFileSync(SRC, 'utf8'));
if (!PREVIEW && data.launch !== true) {
  console.log('スクールガイド: まだ公開しない（data/lessons.json の launch が true になっていない）。確認用は --preview <出力先>');
  process.exit(0);
}

const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度|内部|Muse|スクショ/;
const CONTACT = /0[789]0-?\d{4}-?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;
const PRAISE = /おすすめ|オススメ|No\.?\s?1|ナンバーワン|いちばん人気|一番人気|必ず上達|地域一番|最高の|口コミ|満足度/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const fmtDay = (iso) => `${+iso.slice(0, 4)}年${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;

const problems = [];
const GENRES = data.genres || [];
const AGES = data.ages || {};
const MIN = data.min_launch ?? 5;
const STATIONS = data.stations || [];
const NEAR = data.near || {};

let list = [...(data.lessons || []), ...(data.facts || [])];
if (PREVIEW) list.push(...(data.samples || []));
const skipped = list.filter((l) => l.verified !== true);
if (!PREVIEW) list = list.filter((l) => l.verified === true);
if (!PREVIEW && list.length < MIN) { console.error(`🔴 公開は${MIN}教室そろってから（いま${list.length}教室）。data/lessons.json の launch を false に戻すか、教室を足す`); process.exit(1); }

for (const l of list) {
  const nm = l.name || l.id;
  const isFact = l.kind === 'fact';
  const need = isFact ? ['id', 'name', 'yomi', 'genre', 'where', 'url'] : ['id', 'name', 'yomi', 'genre', 'who', 'when', 'cost', 'book', 'pr', 'where', 'url'];
  for (const f of need) if (!l[f]) problems.push(`${nm}: ${f} が無い`);
  if (!GENRES.some((g) => g.key === l.genre)) problems.push(`${nm}: ジャンル「${l.genre}」は genres に無い`);
  l.ages = l.ages || [];
  if ((!isFact && !l.ages.length) || l.ages.some((a) => !AGES[a])) problems.push(`${nm}: ages（${Object.keys(AGES).join('/')}）が無いか、違う`);
  if (!PREVIEW && !l.checked) problems.push(`${nm}: checked（公式を確かめた日）が無い`);
  const shown = [l.name, l.who, l.when, l.cost, l.trial, l.book, l.where, l.catch, l.seats, l.perk, ...(l.notes || [])].filter(Boolean).join(' ');
  if (PRAISE.test(shown)) problems.push(`${nm}: 比べる言葉・評価の言葉が入っている（${shown.match(PRAISE)[0]}）`);
}
if (problems.length) { for (const p of problems) console.error('🔴 ' + p); process.exit(1); }

// ── 駅（しぼりこみ用）: where に書いてある駅。無ければ町名から近い駅（data の near）。どちらも無ければ空 ──
const STATION_RE = /(花小金井|新小平|小平|一橋学園|鷹の台|小川|青梅街道|八坂|恋ヶ窪|東久留米)駅/;
function stationOf(l) {
  const m = (l.where || '').match(STATION_RE);
  if (m) return STATIONS.includes(m[1]) ? m[1] : 'other';
  const town = (l.where || '').split(/[（(／・、\s]/)[0];
  return NEAR[town] || '';
}
// 体験: free（無料）／yes（あり・有料）／look（見学）／''（書いていない）
function trialKind(t) { if (!t) return ''; if (/無料/.test(t)) return 'free'; if (/体験/.test(t)) return 'yes'; if (/見学/.test(t)) return 'look'; return 'yes'; }
function trialLabel(t) {
  if (!t) return '';
  if (/無料/.test(t)) return '無料体験あり';
  const m = t.match(/([\d,]+)円/);
  if (m) return `体験 ${m[1]}円`;
  if (/有料/.test(t)) return '体験あり（有料）';
  if (/体験/.test(t)) return '体験あり';
  if (/見学/.test(t)) return '見学できます';
  return t;
}
for (const l of list) { l._st = stationOf(l); l._tr = trialKind(l.trial); }

// ── 絵（ジャンルのしるし）。線だけの小さな絵。色はジャンルごと ──
const ICON = {
  taiso: '<circle cx="12" cy="5" r="2.2"/><path d="M5 8.5l7 2.5 7-2.5M12 11v4.5M12 15.5l-4 5M12 15.5l4 5"/>',
  dance: '<path d="M12 3.5l2.3 5.4 5.7.6-4.3 3.9 1.3 5.7L12 16.1 7 19.1l1.3-5.7L4 9.5l5.7-.6z"/>',
  swim: '<path d="M3 8.5c1.8 0 1.8-1.6 3.6-1.6s1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6M3 13c1.8 0 1.8-1.6 3.6-1.6s1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6M3 17.5c1.8 0 1.8-1.6 3.6-1.6s1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3.2 2.6 3.2 14.4 0 17M12 3.5c-3.2 2.6-3.2 14.4 0 17"/>',
  budo: '<path d="M3 9.5h18v4H3z"/><path d="M10 8.5h4v6h-4zM10.6 14.5l-2.2 6M13.4 14.5l2.2 6"/>',
  music: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  english: '<path d="M4 4.5h16v11H10l-4.5 4v-4H4z"/><path d="M8.4 12.6l2.1-5.6 2.1 5.6M9.2 10.8h2.6M14.6 7.4v5.2"/>',
  art: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9s-1-1.4-1-2.4 1-1.6 2-1.6h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.6" cy="11" r="1.2"/><circle cx="10.4" cy="7.3" r="1.2"/><circle cx="15" cy="7.6" r="1.2"/>',
  manabi: '<path d="M3 5.5h6a3 3 0 0 1 3 3v11a2.2 2.2 0 0 0-2.2-2.2H3zM21 5.5h-6a3 3 0 0 0-3 3v11a2.2 2.2 0 0 1 2.2-2.2H21z"/>',
  other: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
};
const icon = (g, cls = 'gi') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[g] || ICON.other}</svg>`;
const SVG = {
  who: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/></svg>',
  where: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/></svg>',
  out: '<svg class="oi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6L7 17"/></svg>',
  gift: '<svg class="pi" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5h16v3H4zM5.5 13.5h13v7h-13zM12 10.5v10M12 10.5c-1.5-3.5-5.5-4.5-5.5-2s3.5 2 5.5 2c2 0 5.5.5 5.5-2s-4-1.5-5.5 2z"/></svg>',
  up: '<svg class="ui" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>',
};

// ── PRカードの写真のイメージ（見本だけ。本番は教室からいただいた写真）。四角・丸・線だけの絵 ──
const PHOTO = {
  english: [
    { bg: '#FCEBD2', body: '<rect x="40" y="96" width="62" height="62" rx="6" fill="#E9794F"/><rect x="108" y="96" width="62" height="62" rx="6" fill="#4FA3C4"/><rect x="74" y="36" width="62" height="62" rx="6" fill="#74AE71"/><text x="71" y="140" font-size="38" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">A</text><text x="139" y="140" font-size="38" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">B</text><text x="105" y="80" font-size="38" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">C</text><path d="M196 46h86a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10h-52l-16 14v-14h-18a10 10 0 0 1-10-10V56a10 10 0 0 1 10-10z" fill="#fff"/><text x="239" y="81" font-size="22" font-weight="700" text-anchor="middle" fill="#34434C" font-family="sans-serif">Hello!</text>' },
    { bg: '#E4F1F6', body: '<path d="M60 52h90v104H60a8 8 0 0 1-8-8V60a8 8 0 0 1 8-8z" fill="#fff"/><path d="M260 52h-90v104h90a8 8 0 0 0 8-8V60a8 8 0 0 0-8-8z" fill="#fff"/><path d="M150 52h20v104h-20z" fill="#DCD5C6"/><circle cx="100" cy="92" r="20" fill="#EBA24A"/><path d="M190 80h56M190 96h50M190 112h56M190 128h40" stroke="#97A2AA" stroke-width="6" stroke-linecap="round"/>' },
    { bg: '#EEF6EC', body: '<circle cx="96" cy="88" r="30" fill="#F2C9A6"/><path d="M58 168c4-30 22-46 38-46s34 16 38 46z" fill="#4FA3C4"/><circle cx="214" cy="96" r="24" fill="#F2C9A6"/><path d="M182 168c3-24 17-38 32-38s29 14 32 38z" fill="#E9794F"/><path d="M128 52l10-14M136 60l16-6" stroke="#EBA24A" stroke-width="6" stroke-linecap="round"/>' },
  ],
  swim: [
    { bg: '#D8EEF7', body: '<path d="M0 70h320M0 122h320" stroke="#fff" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/><path d="M0 100c20 0 20-10 40-10s20 10 40 10 20-10 40-10 20 10 40 10 20-10 40-10 20 10 40 10 20-10 40-10 20 10 40 10" stroke="#4FA3C4" stroke-width="6" fill="none"/><circle cx="230" cy="120" r="26" fill="none" stroke="#E9794F" stroke-width="14"/><path d="M216 98l6 10M246 102l-8 8M210 138l10-6M248 140l-10-6" stroke="#fff" stroke-width="6"/>' },
    { bg: '#E7F3EE', body: '<rect x="40" y="40" width="240" height="120" rx="14" fill="#4FA3C4"/><path d="M40 84h240M40 120h240" stroke="#fff" stroke-width="3" stroke-dasharray="8 8"/><circle cx="120" cy="102" r="12" fill="#F2C9A6"/><path d="M132 102c14-6 26-6 40 0" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>' },
    { bg: '#FDF3E2', body: '<rect x="70" y="60" width="180" height="100" rx="10" fill="#fff"/><path d="M70 92h180" stroke="#DCD5C6" stroke-width="3"/><rect x="92" y="108" width="38" height="36" rx="4" fill="#74AE71"/><rect x="141" y="108" width="38" height="36" rx="4" fill="#EBA24A"/><rect x="190" y="108" width="38" height="36" rx="4" fill="#4FA3C4"/><circle cx="160" cy="44" r="18" fill="#E9794F"/>' },
  ],
  piano: [
    { bg: '#EEEAF7', body: '<rect x="30" y="96" width="260" height="70" rx="6" fill="#fff"/>' + Array.from({ length: 13 }, (_, i) => `<path d="M${50 + i * 20} 96v70" stroke="#DCD5C6" stroke-width="2"/>`).join('') + [0, 1, 3, 4, 5, 7, 8, 10, 11].map((i) => `<rect x="${44 + i * 20}" y="96" width="12" height="40" rx="2" fill="#34434C"/>`).join('') + '<path d="M120 30v40M120 30l26-6v40" stroke="#8A62B8" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="112" cy="70" r="10" fill="#8A62B8"/><circle cx="138" cy="64" r="10" fill="#8A62B8"/>' },
    { bg: '#FBEEDA', body: '<rect x="96" y="42" width="128" height="116" rx="10" fill="#fff"/><path d="M114 72h92M114 92h92M114 112h92M114 132h92" stroke="#97A2AA" stroke-width="3"/><circle cx="140" cy="92" r="8" fill="#34434C"/><circle cx="170" cy="112" r="8" fill="#34434C"/><path d="M148 92V64M178 112V84" stroke="#34434C" stroke-width="4"/>' },
    { bg: '#E4F1F6', body: '<rect x="60" y="110" width="200" height="16" rx="4" fill="#34434C"/><rect x="88" y="126" width="10" height="34" fill="#34434C"/><rect x="222" y="126" width="10" height="34" fill="#34434C"/><circle cx="160" cy="70" r="22" fill="#F2C9A6"/><path d="M132 110c4-18 14-26 28-26s24 8 28 26z" fill="#EBA24A"/>' },
  ],
};
const photoSvg = (p, label) => `<svg viewBox="0 0 320 200" role="img" aria-label="${esc(label)}"><rect width="320" height="200" fill="${p.bg}"/>${p.body}</svg>`;

// ── 無料の欄（事実だけ）。1教室2〜3行。行ぜんたいが教室のページへのリンク。自宅の教室もあるので地図は付けない ──
function factRow(l) {
  const flag = l.verified !== true ? '<span class="flag">確認中</span>' : '';
  const tl = trialLabel(l.trial);
  const who = l.who || l.ages.map((a) => AGES[a]).join('・');
  return `<a class="row" data-item id="${esc(l.id)}" href="${esc(l.url)}" target="_blank" rel="noopener" data-genre="${esc(l.genre)}" data-ages="${esc(l.ages.join(' '))}" data-st="${esc(l._st)}" data-trial="${l._tr}" data-goatcounter-click="${esc('スクール公式｜' + l.name)}">
      <span class="row-b">
        <span class="row-n">${esc(l.name)}${flag}</span>
        <span class="row-m">${who ? `<span class="mt">${SVG.who}${esc(who)}</span>` : ''}<span class="mt">${SVG.where}${esc(l.where)}</span></span>
        ${tl ? `<span class="tr tr-${l._tr}">${esc(tl)}</span>` : ''}
      </span>
      ${SVG.out}
    </a>`;
}

// ── PRカード（掲載料をいただいた教室）。開いた形で、写真・ひとこと・くわしい中身・特典・申込み ──
function prCard(l) {
  const flag = l.sample ? '<span class="flag">見本</span>' : (l.verified !== true ? '<span class="flag">確認中</span>' : '');
  const photos = l.sample && PHOTO[l.photo] ? PHOTO[l.photo] : [];
  const kv = (k, v) => (v ? `<div class="kv"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
  const src = l.sample
    ? '内容は見本です。本番は、教室からいただいた内容と、教室の案内に書いてあることだけを載せます。'
    : `教室からいただいた内容と、教室の案内に書いてあることです${l.checked ? `（${fmtDay(l.checked)}）` : ''}。`;
  return `<article class="prc" data-item id="${esc(l.id)}" data-genre="${esc(l.genre)}" data-ages="${esc(l.ages.join(' '))}" data-st="${esc(l._st)}" data-trial="${l._tr}">
      <div class="prc-top"><span class="prt">PR</span><span class="prn">掲載料をいただいている教室です</span>${flag}</div>
      ${photos.length ? `<div class="ph" tabindex="0" aria-label="教室の写真（横に流せます）">${photos.map((p, i) => `<figure>${photoSvg(p, `${l.name}の写真のイメージ ${i + 1}`)}</figure>`).join('')}</div>
      <p class="ph-cap">${l.sample ? '写真のイメージです。教室の写真が3枚まで入ります。' : ''}</p>` : ''}
      <div class="prc-b">
        <h3 class="prc-n">${esc(l.name)}</h3>
        <p class="row-m prc-m"><span class="mt">${SVG.who}${esc(l.who)}</span><span class="mt">${SVG.where}${esc(l.where)}</span></p>
        ${l.catch ? `<p class="catch">${esc(l.catch)}</p>` : ''}
        <dl class="kvs">
          ${kv('曜日・時間', l.when)}
          ${kv('費用', l.cost)}
          ${kv('体験', l.trial)}
          ${kv('空き', l.seats)}
          ${kv('申込み', l.book)}
        </dl>
        ${l.perk ? `<p class="perk">${SVG.gift}<span><b>通信を見た方へ</b>${esc(l.perk.replace(/^「ぼんぼやーじゅ通信を見た」で、?/, '「通信を見た」で、'))}</span></p>` : ''}
        ${(l.notes || []).length ? `<ul class="nt">${l.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <div class="acts">
          <a class="btn btn-main" href="${esc(l.url)}" target="_blank" rel="noopener" data-goatcounter-click="${esc('スクール申込｜' + l.name)}">体験の申込み・教室のページ</a>
          <a class="btn" href="${esc(mapUrl(l.mapq || l.name))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('スクール地図｜' + l.name)}">地図</a>
        </div>
        <p class="chk">${src}</p>
      </div>
    </article>`;
}

const card = (l) => (l.kind === 'fact' ? factRow(l) : prCard(l));
// ジャンルの中は五十音。続いた事実の行は1つの枠にまとめ、PRカードはその間に挟む
function section(g, items) {
  let html = '', buf = [];
  const flush = () => { if (buf.length) { html += `<div class="list">${buf.join('')}</div>`; buf = []; } };
  for (const l of items) { if (l.kind === 'fact') buf.push(factRow(l)); else { flush(); html += prCard(l); } }
  flush();
  return `<section class="gs" data-genre="${g.key}" id="g-${g.key}">
    <h2 class="sec">${icon(g.key)}<span>${esc(g.label)}</span><small class="sec-c" data-sec-count>${items.length}</small></h2>
    ${html}
  </section>`;
}

const byGenre = GENRES.map((g) => ({ g, items: list.filter((l) => l.genre === g.key).sort((a, b) => a.yomi.localeCompare(b.yomi, 'ja')) })).filter((x) => x.items.length);
const n = list.length;
const checkedDays = [...new Set(list.filter((l) => l.kind === 'fact').map((l) => l.checked).filter(Boolean))].sort();
const lastChecked = checkedDays.length ? fmtDay(checkedDays[checkedDays.length - 1]) : '';
const stCount = (s) => list.filter((l) => l._st === s).length;
const title = 'スクールガイド（小平の子どもの習い事）';
const desc = '小平の子どもの習い事の教室を、年齢・ジャンル・駅でしぼって探せるページ。教室の案内に書いてあることを、同じ形でそろえました。';

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title}｜ぼんぼやーじゅ通信</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/school.html">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}/school.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="ja_JP">
${PREVIEW ? '<meta name="robots" content="noindex,nofollow">\n' : ''}<link rel="stylesheet" href="/assets/bv-tokens.css">
<link rel="stylesheet" href="/assets/bv-nav.css">
<script src="/assets/analytics.js" defer></script>
<style>
  /* さがす（上の枠）→ ジャンルごとの一覧（無料の行と、PRのカード）。色はサイトの色に、ジャンルの色と PR の色を足す */
  :root {
    --pr-line:#E6B45E; --pr-bg:#FFFBF3; --pr-tag:#8A5A12; --pr-tag-bg:#FBEBC8;
    --perk-bg:#FDEEF1; --perk-ink:#93364F;
    --free-bg:#E4F2E1; --free-ink:#2E6A2B; --tr-bg:var(--surface-2); --tr-ink:var(--ink-soft);
    --g-taiso:#3E8A4B; --g-dance:#B4466F; --g-swim:#22799F; --g-ball:#B26F1D; --g-budo:#4A5A99;
    --g-music:#7A4FAA; --g-english:#1F6F8C; --g-art:#BB5530; --g-manabi:#2F7D71; --g-other:#66737B;
    --fab-bg:#2C3A42; --fab-ink:#FFFFFF;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --pr-line:#9A7434; --pr-bg:#1F2B2F; --pr-tag:#F3CF8A; --pr-tag-bg:#3D321D;
    --perk-bg:#3A2630; --perk-ink:#F2B3C4;
    --free-bg:#203A27; --free-ink:#9FD69A;
    --g-taiso:#8FD09A; --g-dance:#F09AB9; --g-swim:#86CBEA; --g-ball:#F2B66A; --g-budo:#A9B6F0;
    --g-music:#C9A8EE; --g-english:#8FD0EA; --g-art:#F4A285; --g-manabi:#86D2C4; --g-other:#B3C0C7;
    --fab-bg:#E8EEF0; --fab-ink:#132028;
  } }
  :root[data-theme="dark"] {
    --pr-line:#9A7434; --pr-bg:#1F2B2F; --pr-tag:#F3CF8A; --pr-tag-bg:#3D321D;
    --perk-bg:#3A2630; --perk-ink:#F2B3C4;
    --free-bg:#203A27; --free-ink:#9FD69A;
    --g-taiso:#8FD09A; --g-dance:#F09AB9; --g-swim:#86CBEA; --g-ball:#F2B66A; --g-budo:#A9B6F0;
    --g-music:#C9A8EE; --g-english:#8FD0EA; --g-art:#F4A285; --g-manabi:#86D2C4; --g-other:#B3C0C7;
    --fab-bg:#E8EEF0; --fab-ink:#132028;
  }
  main { padding: 1rem 0 5rem; }
  .ghead-in { padding-top: .9rem; padding-bottom: .9rem; }
  .ghead .eyebrow { display: none; }
  .ghead h1 { font-size: clamp(1.5rem, 5vw, 2rem); margin-bottom: .2rem; }
  .ghead .sub { font-size: .98rem; line-height: 1.7; font-weight: 700; }
  .ghead .trust { font-size: .8rem; line-height: 1.75; color: var(--ink-soft); margin-top: .45rem; max-width: 34rem; }
  .ghead .trust b { color: var(--pr-tag); background: var(--pr-tag-bg); border-radius: 4px; padding: 0 .3rem; font-size: .74rem; letter-spacing: .06em; }

  /* ── さがす ── */
  .finder { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-soft); padding: .9rem .85rem 1rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .85rem; scroll-margin-top: 104px; }
  .finder > * { min-width: 0; }
  .f-lab { display: block; font-family: var(--maru); font-weight: 800; font-size: .8rem; color: var(--ink-soft); margin-bottom: .35rem; letter-spacing: .04em; }
  .seg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line-strong); border-radius: 12px; overflow: hidden; }
  .seg button { font: inherit; font-size: .8rem; font-weight: 700; min-height: 44px; padding: .2rem .15rem; border: 0; border-left: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; line-height: 1.25; }
  .seg button:first-child { border-left: 0; }
  .seg button[aria-pressed="true"] { background: var(--sky-deep); color: var(--on-sky); }
  .gt { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .35rem; }
  .gt button { font: inherit; display: flex; flex-direction: column; align-items: center; gap: .15rem; padding: .45rem .1rem .35rem; min-height: 72px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); cursor: pointer; }
  .gt button .gi { width: 30px; height: 30px; padding: 5px; border-radius: 999px; background: var(--surface-2); }
  .gt button .gl { font-size: .68rem; font-weight: 700; line-height: 1.2; text-align: center; word-break: keep-all; overflow-wrap: anywhere; }
  .gt button .c { font-size: .64rem; color: var(--ink-faint); line-height: 1; font-variant-numeric: tabular-nums; }
  .gt button[aria-pressed="true"] { border-color: currentColor; box-shadow: inset 0 0 0 1.5px currentColor; }
  .gt button[aria-pressed="true"] .gl { color: inherit; }
  .gt button:disabled { opacity: .38; cursor: default; }
  .sc { display: flex; flex-wrap: wrap; gap: .35rem; }
  .sc button { font: inherit; flex: none; display: inline-flex; align-items: center; gap: .3rem; min-height: 40px; padding: 0 .8rem; font-size: .8rem; font-weight: 700; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
  .sc button .c { font-size: .7rem; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
  .sc button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }
  .sc button[aria-pressed="true"] .c { color: inherit; opacity: .8; }
  .sc button:disabled { opacity: .4; cursor: default; }
  .f-note { font-size: .7rem; color: var(--ink-faint); line-height: 1.6; margin-top: .3rem; }
  .tog { display: flex; align-items: center; gap: .55rem; min-height: 44px; font-size: .86rem; font-weight: 700; cursor: pointer; }
  .tog input { width: 1.3rem; height: 1.3rem; accent-color: var(--sky-deep); margin: 0; }
  .f-res { display: flex; align-items: baseline; gap: .4rem; flex-wrap: wrap; padding-top: .7rem; border-top: 1px solid var(--line); }
  .f-res .num { font-family: var(--maru); font-weight: 800; font-size: 1.5rem; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
  .f-res .unit { font-size: .86rem; font-weight: 700; }
  .f-res .cond { font-size: .76rem; color: var(--ink-soft); }
  .f-res .rs { margin-left: auto; font: inherit; font-size: .76rem; font-weight: 700; color: var(--link-ink); background: none; border: 0; padding: .4rem 0; min-height: 36px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  button:focus-visible, a:focus-visible, .ph:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }

  /* ── 一覧 ── */
  .gs { scroll-margin-top: 104px; }
  h2.sec { display: flex; align-items: center; gap: .5rem; font-family: var(--maru); font-weight: 800; font-size: 1.08rem; margin: 1.6rem 0 .55rem; }
  h2.sec .gi { width: 32px; height: 32px; padding: 6px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); flex: none; }
  .sec-c { font-size: .76rem; color: var(--ink-faint); font-weight: 700; font-variant-numeric: tabular-nums; }
  .gi, .mi, .oi, .pi, .ui { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  ${GENRES.map((g) => `[data-genre="${g.key}"] .gi, .gt button[data-g="${g.key}"] { color: var(--g-${g.key}); }`).join('\n  ')}
  .list { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: .6rem; }
  .row { display: flex; align-items: center; gap: .6rem; padding: .7rem .85rem; text-decoration: none; color: var(--ink); border-top: 1px solid var(--line); min-height: 64px; scroll-margin-top: 104px; }
  .list > .row:first-child, .list > .row[hidden] + .row:not([hidden]) { border-top: 0; }
  .row:hover { background: var(--surface-2); }
  .row-b { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: .2rem; }
  .row-n { font-family: var(--maru); font-weight: 800; font-size: .96rem; line-height: 1.45; }
  .row-m { display: flex; flex-wrap: wrap; gap: .1rem .8rem; font-size: .78rem; line-height: 1.55; color: var(--ink-soft); }
  .mt { display: inline-flex; align-items: flex-start; gap: .2rem; min-width: 0; }
  .mi { width: 14px; height: 14px; flex: none; margin-top: .18rem; color: var(--ink-faint); }
  .oi { width: 18px; height: 18px; flex: none; color: var(--ink-faint); }
  .tr { align-self: flex-start; font-size: .7rem; font-weight: 700; border-radius: 6px; padding: .05rem .45rem; background: var(--tr-bg); color: var(--tr-ink); }
  .tr-free { background: var(--free-bg); color: var(--free-ink); }
  .flag { display: inline-block; margin-left: .4rem; font-family: var(--body); font-size: .64rem; font-weight: 700; color: var(--ink-faint); border: 1px dashed var(--ink-faint); border-radius: 5px; padding: 0 .3rem; vertical-align: 2px; letter-spacing: 0; }

  /* ── PRカード ── */
  .prc { background: var(--pr-bg); border: 1.5px solid var(--pr-line); border-radius: var(--radius-sm); margin: .7rem 0; overflow: hidden; box-shadow: var(--shadow-soft); scroll-margin-top: 104px; }
  .prc-top { display: flex; align-items: center; gap: .45rem; padding: .5rem .85rem; border-bottom: 1px solid var(--pr-line); }
  .prt { font-weight: 800; font-size: .74rem; letter-spacing: .08em; color: var(--pr-tag); background: var(--pr-tag-bg); border-radius: 5px; padding: .05rem .45rem; }
  .prn { font-size: .72rem; color: var(--ink-soft); }
  .prc-top .flag { margin-left: auto; }
  .ph { display: flex; gap: .4rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: .7rem .85rem 0; -webkit-overflow-scrolling: touch; }
  .ph::-webkit-scrollbar { display: none; }
  .ph figure { margin: 0; flex: 0 0 78%; scroll-snap-align: start; border-radius: 10px; overflow: hidden; aspect-ratio: 16 / 10; max-width: 100%; }
  .ph figure svg { display: block; width: 100%; height: 100%; }
  .ph-cap { font-size: .68rem; color: var(--ink-faint); padding: .3rem .85rem 0; }
  .ph-cap:empty { display: none; }
  .prc-b { padding: .55rem .85rem .85rem; }
  .prc-n { font-family: var(--maru); font-weight: 800; font-size: 1.12rem; line-height: 1.4; margin: 0 0 .2rem; }
  .prc-m { margin: 0 0 .55rem; }
  .catch { font-size: .86rem; line-height: 1.75; margin: 0 0 .6rem; padding-left: .7rem; border-left: 3px solid var(--pr-line); }
  .kvs { display: grid; gap: .3rem; margin: 0 0 .6rem; padding: .6rem .7rem; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  .kv { display: grid; grid-template-columns: 5.2em minmax(0, 1fr); gap: .5rem; font-size: .84rem; line-height: 1.6; }
  .kv dt { color: var(--ink-faint); font-size: .76rem; font-weight: 700; padding-top: .08rem; }
  .kv dd { margin: 0; min-width: 0; }
  .perk { display: flex; gap: .5rem; align-items: flex-start; margin: 0 0 .6rem; padding: .55rem .7rem; background: var(--perk-bg); color: var(--perk-ink); border-radius: 10px; font-size: .84rem; line-height: 1.6; font-weight: 700; }
  .perk b { display: block; font-size: .72rem; letter-spacing: .04em; }
  .pi { width: 22px; height: 22px; flex: none; margin-top: .1rem; }
  .nt { list-style: none; margin: 0 0 .6rem; padding: 0; display: grid; gap: .15rem; }
  .nt li { position: relative; padding-left: .9rem; font-size: .82rem; line-height: 1.65; color: var(--ink-soft); }
  .nt li::before { content: ""; position: absolute; left: .15rem; top: .65em; width: 5px; height: 5px; border-radius: 999px; background: var(--pr-line); }
  .acts { display: flex; gap: .4rem; margin-bottom: .45rem; }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 1rem; border-radius: 999px; font-size: .86rem; font-weight: 800; text-decoration: none; color: var(--link-ink); background: var(--surface); border: 1px solid var(--line-strong); white-space: nowrap; }
  .btn-main { flex: 1 1 auto; background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); white-space: normal; text-align: center; line-height: 1.35; }
  .chk { font-size: .7rem; color: var(--ink-faint); line-height: 1.6; }

  .none { text-align: center; padding: 1.4rem 1rem; background: var(--surface); border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); margin-top: 1rem; font-size: .9rem; }
  .none button { font: inherit; font-weight: 800; color: var(--link-ink); background: none; border: 0; text-decoration: underline; cursor: pointer; min-height: 44px; }
  .ask { margin-top: 1.6rem; padding: .85rem 1rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: .84rem; line-height: 1.8; color: var(--ink-soft); }
  .ask b { display: block; font-family: var(--maru); font-weight: 800; color: var(--ink); font-size: .95rem; margin-bottom: .2rem; }
  .about { font-size: .8rem; color: var(--ink-soft); line-height: 1.8; margin-top: 1.1rem; }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.6rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }

  /* 下に浮かぶ「条件を変える」（さがすの枠が見えないときだけ） */
  .fab { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 800; display: inline-flex; align-items: center; gap: .45rem; min-height: 48px; padding: 0 1.1rem; border-radius: 999px; background: var(--fab-bg); color: var(--fab-ink); font-size: .86rem; font-weight: 800; text-decoration: none; box-shadow: 0 6px 22px rgba(0,0,0,.22); white-space: nowrap; }
  .fab .ui { width: 18px; height: 18px; }
  .fab b { font-family: var(--maru); font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  @media (min-width: 40rem) { .gt { grid-template-columns: repeat(10, minmax(0, 1fr)); } .ph figure { flex-basis: 46%; } }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
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
${navSub('lessons')}
</nav>
<header class="ghead">
  <div class="ghead-in">
    <div class="eyebrow">Bon Voyage,</div>
    <h1>スクールガイド</h1>
    <p class="sub">小平の子どもの習い事 ${n}教室を、年齢・ジャンル・駅でさがせます。</p>
    <p class="trust">教室の案内に書いてあることを、同じ形でそろえました${lastChecked ? `（${lastChecked.replace(/^\d+年/, '')}に確認）` : ''}。<b>PR</b> は掲載料をいただいた教室です。</p>
  </div>
</header>

<main class="wrap">
  <section class="finder" id="finder" aria-label="教室をさがす">
    <div>
      <span class="f-lab" id="lab-age">年齢</span>
      <div class="seg" role="group" aria-labelledby="lab-age">
        <button type="button" data-age="all" aria-pressed="true">すべて</button>
        ${Object.entries(AGES).map(([k, v]) => `<button type="button" data-age="${k}" aria-pressed="false">${esc(v)}</button>`).join('\n        ')}
      </div>
    </div>
    <div>
      <span class="f-lab" id="lab-g">ジャンル</span>
      <div class="gt" role="group" aria-labelledby="lab-g">
        ${byGenre.map(({ g, items }) => `<button type="button" data-g="${g.key}" aria-pressed="false">${icon(g.key)}<span class="gl">${esc(g.label).replace(/・/g, '・<wbr>')}</span><span class="c">${items.length}</span></button>`).join('\n        ')}
      </div>
    </div>
    <div>
      <span class="f-lab" id="lab-st">駅</span>
      <div class="sc" role="group" aria-labelledby="lab-st">
        <button type="button" data-st="" aria-pressed="true">すべての駅</button>
        ${STATIONS.filter((s) => stCount(s)).map((s) => `<button type="button" data-st="${esc(s)}" aria-pressed="false">${esc(s)}<span class="c">${stCount(s)}</span></button>`).join('\n        ')}
        ${stCount('other') ? `<button type="button" data-st="other" aria-pressed="false">そのほかの駅<span class="c">${stCount('other')}</span></button>` : ''}
      </div>
      <p class="f-note">駅が書いていない教室は、町の位置から近い駅に入れています。</p>
    </div>
    <label class="tog"><input type="checkbox" id="free-only">無料体験がある教室だけ</label>
    <div class="f-res" aria-live="polite"><span class="num" id="cnt">${n}</span><span class="unit">教室</span><span class="cond" id="cond"></span><button type="button" class="rs" id="reset" hidden>条件をもどす</button></div>
  </section>

  ${byGenre.map(({ g, items }) => section(g, items)).join('\n  ')}

  <div class="none" id="none" hidden>この条件に合う教室は、まだ載っていません。<br><button type="button" id="reset2">条件をもどす</button></div>

  <div class="ask">
    <b>教室の方へ</b>
    内容の直し、載せてほしくないとき（すぐに外します）、曜日や体験の日までくわしく載せたいときは、<a href="/#contact">お問い合わせ</a>からご連絡ください。
  </div>

  <p class="about">「PR」の付いた教室からは、掲載料をいただいています。PRの付いていない教室は、教室の案内に書いてあることを無料で載せています。並びは、PRかどうかに関係なく、ジャンルごとの五十音順です。費用や曜日は変わることがあります。申し込む前に、それぞれの公式の案内でご確認ください。<br>
  内容の誤りに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
    <a href="/entei.html">こだいら幼稚園だより</a>
    <a href="/cafe.html">子連れで入りやすいカフェ</a>
  </div>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<a class="fab" id="fab" href="#finder" hidden>${SVG.up}<b id="fabn">${n}</b>教室・条件を変える</a>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script>
/* さがす: 年齢・ジャンル・駅・無料体験を組み合わせてしぼる。ボタンの数は、ほかの条件に合う教室の数 */
(function () {
  var st = { age: 'all', g: '', st: '', free: false };
  var AGE = ${JSON.stringify(AGES)};
  var items = [].slice.call(document.querySelectorAll('[data-item]'));
  var secs = [].slice.call(document.querySelectorAll('.gs'));
  var lists = [].slice.call(document.querySelectorAll('.list'));
  var $ = function (id) { return document.getElementById(id); };
  function ok(el, skip) {
    if (skip !== 'age' && st.age !== 'all' && (' ' + el.getAttribute('data-ages') + ' ').indexOf(' ' + st.age + ' ') < 0) return false;
    if (skip !== 'g' && st.g && el.getAttribute('data-genre') !== st.g) return false;
    if (skip !== 'st' && st.st && el.getAttribute('data-st') !== st.st) return false;
    if (skip !== 'free' && st.free && el.getAttribute('data-trial') !== 'free') return false;
    return true;
  }
  function count(attr, val, skip) { var c = 0; items.forEach(function (el) { if ((val === '' || el.getAttribute(attr) === val) && ok(el, skip)) c++; }); return c; }
  function apply() {
    var n = 0;
    items.forEach(function (el) { var on = ok(el); el.hidden = !on; if (on) n++; });
    lists.forEach(function (l) { l.hidden = !l.querySelector('[data-item]:not([hidden])'); });
    secs.forEach(function (s) {
      var c = s.querySelectorAll('[data-item]:not([hidden])').length;
      s.hidden = !c; var sc = s.querySelector('[data-sec-count]'); if (sc) sc.textContent = c;
    });
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-age') === st.age ? 'true' : 'false'); });
    document.querySelectorAll('.gt button').forEach(function (b) {
      var g = b.getAttribute('data-g'), c = count('data-genre', g, 'g');
      b.querySelector('.c').textContent = c; b.setAttribute('aria-pressed', st.g === g ? 'true' : 'false'); b.disabled = !c && st.g !== g;
    });
    document.querySelectorAll('.sc button').forEach(function (b) {
      var s = b.getAttribute('data-st'), c = s ? count('data-st', s, 'st') : 0, cc = b.querySelector('.c');
      if (cc) cc.textContent = c; b.setAttribute('aria-pressed', st.st === s ? 'true' : 'false'); if (s) b.disabled = !c && st.st !== s;
    });
    $('free-only').checked = st.free;
    var cond = [];
    if (st.age !== 'all') cond.push(AGE[st.age]);
    if (st.g) cond.push(document.querySelector('.gt button[data-g="' + st.g + '"] .gl').textContent);
    if (st.st) cond.push(st.st === 'other' ? 'そのほかの駅' : st.st + '駅');
    if (st.free) cond.push('無料体験あり');
    $('cnt').textContent = n; $('fabn').textContent = n;
    $('cond').textContent = cond.length ? '（' + cond.join('・') + '）' : '';
    $('reset').hidden = !cond.length;
    $('none').hidden = n > 0;
  }
  document.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { st.age = b.getAttribute('data-age'); apply(); }); });
  document.querySelectorAll('.gt button').forEach(function (b) { b.addEventListener('click', function () { var g = b.getAttribute('data-g'); st.g = st.g === g ? '' : g; apply(); }); });
  document.querySelectorAll('.sc button').forEach(function (b) { b.addEventListener('click', function () { st.st = b.getAttribute('data-st'); apply(); }); });
  $('free-only').addEventListener('change', function (e) { st.free = e.target.checked; apply(); });
  function reset() { st = { age: 'all', g: '', st: '', free: false }; apply(); }
  $('reset').addEventListener('click', reset); $('reset2').addEventListener('click', reset);
  /* さがすの枠が画面から外れたら、下に「条件を変える」を出す */
  var fab = $('fab'), finder = $('finder');
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { fab.hidden = es[0].isIntersecting || es[0].boundingClientRect.top > 0; }).observe(finder);
  apply();
})();
</script>
</body>
</html>
`;

const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
const leak = visible.match(LEAK);
if (leak) { console.error(`🔴 公開ページに出せない言葉が入りました: ${leak[0]}`); process.exit(1); }
if (CONTACT.test(visible.replace(/https?:\/\/\S+/g, ''))) { console.error('🔴 個人の連絡先（携帯・メール）らしきものがある'); process.exit(1); }

const out = PREVIEW || OUT;
writeFileSync(out, html);
console.log(`wrote ${out}（${n}件 / ${byGenre.map(({ g, items }) => `${g.label}${items.length}`).join('・')} / 駅: ${STATIONS.map((s) => `${s}${stCount(s)}`).join('・')}・そのほか${stCount('other')}・なし${stCount('')}）`);
if (skipped.length) console.log(`  ${PREVIEW ? '確認中で入れたもの' : '確認中で外したもの'}: ${skipped.map((l) => l.name).join('・')}`);
