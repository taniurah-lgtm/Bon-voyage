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
 *   - 🔁 同日オーナー「掲載料をいただいている教室です、とか書かないで。まじめにやりすぎ」→ カードには「PR」の札だけ。
 *     消費者庁のステマの運用基準（令和5年3月28日）は「広告」「宣伝」「プロモーション」「PR」の文言で事業者の表示と明瞭になる、としている。
 *     掲載料の一文は、いちばん下の小さな「このページについて」にだけ残す
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

// 白いページに固定するため、サイト共通の色の「明るいほう」（bv-tokens.css の最初の :root）をそのまま使う
const LIGHT = (readFileSync('docs/homepage/assets/bv-tokens.css', 'utf8').match(/:root\s*\{([\s\S]*?)\}/) || [, ''])[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
if (!/--ground:/.test(LIGHT)) { console.error('🔴 bv-tokens.css の明るい色が読めない'); process.exit(1); }

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
function stationsOf(l) {
  if (Array.isArray(l.st) && l.st.length) return l.st;
  const m = (l.where || '').match(STATION_RE);
  if (m) return [STATIONS.includes(m[1]) ? m[1] : 'other'];
  const town = (l.where || '').split(/[（(／・、\s]/)[0];
  const near = NEAR[town];
  return near ? [].concat(near) : ['other'];
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
for (const l of list) { l._st = stationsOf(l); l._stx = STATION_RE.test(l.where || ''); l._tr = trialKind(l.trial); }
// 折り返し（2026-11-27 評価役「語の途中で折れる」）: ページの文字は word-break: keep-all にして、
// 改行してよいところに <wbr> を入れる。区切りは Node の Intl.Segmenter（日本語の単語）で、
// 助詞だけの語（の・は・を…）のあとに、漢字・カタカナで始まる語が来るところだけ（文節の切れ目。「ご｜一緒に」「歩き｜始め」のような語の中には入れない）
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
const PARTICLE = new Set(['の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や', 'か', 'から', 'より', 'まで', 'により']);
const CONTENT_START = /^[\u4E00-\u9FFF々〆\u30A1-\u30FA]/;
function jp(v) {
  const s = String(v ?? '');
  if (!SEG) return esc(s);
  let out = '', prev = '', prev2 = '';
  for (const { segment: x } of SEG.segment(s)) {
    // 1字の漢字＋「の」は地名の中（鈴の木台）なので入れない
    if (prev && PARTICLE.has(prev) && CONTENT_START.test(x) && !(prev === 'の' && /^[\u4E00-\u9FFF]$/.test(prev2))) out += '<wbr>';
    out += esc(x); prev2 = prev; prev = x;
  }
  return out;
}
// かっこ書きの短いまとまりと、数字＋単位は途中で折らない（「（11/月20日時点）」「5〜/7分」にしない）
const nb = (v) => {
  const s = String(v ?? ''), re = /（[^（）]{1,14}）|[^\s、。（）・／]{1,6}[〜～][^\s、。（）・／]{1,6}|\d+(?:[〜～-]\d+)?(?:分|歳|人|回|階|円|か月|年生|組)/g;
  let out = '', i = 0, m;
  while ((m = re.exec(s))) { out += jp(s.slice(i, m.index)) + `<span class="nw">${esc(m[0])}</span>`; i = m.index + m[0].length; }
  return out + jp(s.slice(i));
};

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
  down: '<svg class="ui" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>',
  info: '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.4v.2"/></svg>',
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


// ── 無料の欄（事実だけ）。1教室4段（名前／年齢／場所／体験）でそろえる。行ぜんたいが教室のページへのリンク。地図は付けない ──
const whoText = (l) => l.who || l.ages.map((a) => AGES[a]).join('・') || '年齢の記載なし';
// 始まりの年齢（年齢でしぼったときだけ、行の頭に出す）。案内に書いてある年齢の言い直しだけ。決まらないものは出さない
// 🆕 評価5回目: 小さい子の受け入れ（園児・応相談 など）が書いてあるのに「小1から」と出すと、年少の親が「うちは無理」と読む。そういう行は札を出さない
function fromLabel(who) {
  const w = String(who || '').replace(/\s/g, '');
  if (/相談/.test(w)) return '';
  let m, r = '';
  if ((m = w.match(/^(?:満)?(\d{1,2})(?:か月|ヶ月|カ月)/))) r = `${m[1]}か月から`;
  else if ((m = w.match(/^(?:満|原則)?(\d{1,2})(?:[〜～-]\d{1,2})?(?:歳|才)/))) r = `${m[1]}歳から`;
  else if ((m = w.match(/^(年少|年中|年長)/))) r = `${m[1]}から`;
  else if ((m = w.match(/^(?:小学?|小学校)(\d)/))) r = `小${m[1]}から`;
  else if (/^小(?:学生|[・･]?中)/.test(w)) r = '小1から';
  else if (/^(?:0歳|０歳|赤ちゃん|乳児)/.test(w)) r = '0歳から';
  else {
    // 「リトル3〜6歳・…」「子ども中心（4歳〜）」: 頭の近くの年齢が、書いてある中でいちばん小さく、もっと小さい子の言葉が無いときだけ
    const ns = [...w.matchAll(/(\d{1,2})(?:[〜～-]\d{1,2})?(?:歳|才)/g)];
    if (ns.length && ns[0].index <= 8 && +ns[0][1] === Math.min(...ns.map((x) => +x[1])) && !/歩き|赤ちゃん|乳児|ベビー|未就園|未就学|幼児|園児|年少|年中|年長|か月|ヶ月|カ月/.test(w)) r = `${ns[0][1]}歳から`;
  }
  if (/^小/.test(r) && /園児|幼児|年少|年中|年長|未就学|プレ/.test(w)) return '';
  return r;
}
// 駅エリアは「／」で場所の名前と分け、駅ごとに「駅」を付ける（評価5回目: 「・小川・」が場所の名前に読めた）
function whereHtml(l) {
  const w = l.where || '';
  if (l._stx || !l._st.length || l._st.includes('other') || l._st.some((x) => new RegExp(x + '(?!町)').test(w))) return nb(w);
  const area = `${l._st.map((x) => x + '駅').join('・')}エリア`;
  if ((w.match(/（/g) || []).length > 1 || w.includes('／')) return nb(`${w}／${area}`);
  return nb(/）$/.test(w) ? w.replace(/）$/, `／${area}）`) : `${w}（${area}）`);
}
function factRow(l) {
  const flag = l.verified !== true ? '<span class="flag">確認中</span>' : '';
  const tl = trialLabel(l.trial);
  return `<a class="row" data-item id="${esc(l.id)}" href="${esc(l.url)}" target="_blank" rel="noopener" data-genre="${esc(l.genre)}" data-ages="${esc(l.ages.length ? l.ages.join(' ') : '?')}" data-st="${esc(l._st.join(' '))}" data-trial="${l._tr}" data-goatcounter-click="${esc('スクール公式｜' + l.name)}">
      <span class="row-b">
        <span class="row-n">${esc(l.name)}${flag}</span>
        <span class="row-m"><span class="mt">${SVG.who}<span>${fromLabel(whoText(l)) ? `<span class="from">${fromLabel(whoText(l))}</span>` : ''}${nb(whoText(l))}</span></span><span class="mt">${SVG.where}<span>${whereHtml(l)}</span></span></span>
        ${tl ? `<span class="tr tr-${l._tr}">${esc(tl)}</span>` : '<span class="tr tr-none">体験の記載なし</span>'}
      </span>
      ${SVG.out}
    </a>`;
}

// ── PRカード（掲載料をいただいた教室）。名前から読めるように、名前・年齢・場所・空き → 写真 → ひとこと・中身・特典 → 申込み ──
function prCard(l) {
  const flag = l.sample ? '<span class="flag">見本</span>' : (l.verified !== true ? '<span class="flag">確認中</span>' : '');
  const photos = l.sample && PHOTO[l.photo] ? PHOTO[l.photo] : [];
  // 配列は1行ずつ。「クラス名　時刻」（全角の空白で区切る）は、クラス名の行と時刻の行に分ける
  const line = (x) => { const i = String(x).indexOf('　'); return i > 0 ? `<span class="cls">${esc(x.slice(0, i))}</span><span class="tm">${nb(x.slice(i + 1))}</span>` : `<span class="tm">${nb(x)}</span>`; };
  const kv = (k, v) => (v ? `<div class="kv"><dt>${k}</dt><dd>${Array.isArray(v) ? `<span class="lines">${v.map(line).join('')}</span>` : nb(v)}</dd></div>` : '');
  const src = l.sample ? '見本です（教室名・写真・中身は例）。' : `教室からいただいた内容です${l.checked ? `（${fmtDay(l.checked)}）` : ''}。`;
  return `<article class="prc" data-item id="${esc(l.id)}" data-genre="${esc(l.genre)}" data-ages="${esc(l.ages.length ? l.ages.join(' ') : '?')}" data-st="${esc(l._st.join(' '))}" data-trial="${l._tr}">
      <div class="prc-h">
        <div class="prc-top"><a class="prt" href="#about" aria-label="PRについて（ページ下の説明へ）">PR${SVG.info}</a>${flag}</div>
        <h3 class="prc-n">${esc(l.name)}</h3>
        <span class="row-m"><span class="mt">${SVG.who}<span>${nb(l.who)}</span></span><span class="mt">${SVG.where}<span>${whereHtml(l)}</span></span></span>
        ${l.seats ? `<p class="seat"><b>空き</b><span>${nb(l.seats)}</span></p>` : ''}
      </div>
      ${photos.length ? `<div class="ph" tabindex="0" aria-label="教室の写真（横に流せます）">${photos.map((p, i) => `<figure>${photoSvg(p, `${l.name}の写真のイメージ ${i + 1}`)}</figure>`).join('')}</div>
      ${l.sample ? '<p class="ph-cap">写真のイメージ（教室の写真が3枚まで入ります）</p>' : ''}` : ''}
      <div class="prc-b">
        ${l.catch ? `<p class="catch">${esc(l.catch)}</p>` : ''}
        <dl class="kvs">
          ${kv('曜日・時間', l.when)}
          ${kv('費用', l.cost)}
          ${kv('体験', l.trial)}
          ${(l.trialDays || []).length ? `<div class="kv"><dt>体験の日</dt><dd>${l.trialDays.map((d) => `<span class="nw">${esc(d)}</span>`).join('・')}</dd></div>` : ''}
          ${kv('申込み', l.book)}
        </dl>
        ${l.perk ? `<p class="perk">${SVG.gift}<span><b>通信を見た方へ</b>${nb(l.perk.replace(/^「ぼんぼやーじゅ通信を見た」で、?/, '「通信を見た」で、'))}</span></p>` : ''}
        ${(l.notes || []).length ? `<ul class="nt">${l.notes.map((n) => `<li>${nb(n)}</li>`).join('')}</ul>` : ''}
        <a class="btn btn-main" href="${esc(l.bookUrl || l.url)}" target="_blank" rel="noopener" data-goatcounter-click="${esc('スクール申込｜' + l.name)}">体験を申し込む</a>
        <div class="acts">
          <a class="btn" href="${esc(mapUrl(l.mapq || l.name))}" target="_blank" rel="noopener" data-goatcounter-click="${esc('スクール地図｜' + l.name)}">地図</a>
          <a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener" data-goatcounter-click="${esc('スクール公式｜' + l.name)}">教室のページ</a>
        </div>
        <p class="chk">${src}</p>
      </div>
    </article>`;
}

// ジャンルの中は五十音。続いた事実の行は1つの枠にまとめ、PRカードはその間に挟む
function section(g, items) {
  let html = '', buf = [];
  const flush = () => { if (buf.length) { html += `<div class="list">${buf.join('')}</div>`; buf = []; } };
  for (const l of items) { if (l.kind === 'fact') buf.push(factRow(l)); else { flush(); html += prCard(l); } }
  flush();
  return `<section class="gs" data-genre="${g.key}" id="g-${g.key}">
    <h2 class="sec">${icon(g.key)}<span>${esc(g.short || g.label)}</span><small class="sec-c" data-sec-count>${items.length}</small></h2>
    ${html}
  </section>`;
}

const byGenre = GENRES.map((g) => ({ g, items: list.filter((l) => l.genre === g.key).sort((a, b) => a.yomi.localeCompare(b.yomi, 'ja')) })).filter((x) => x.items.length);
const n = list.length;
const checkedDays = [...new Set(list.filter((l) => l.kind === 'fact').map((l) => l.checked).filter(Boolean))].sort();
const lastChecked = checkedDays.length ? fmtDay(checkedDays[checkedDays.length - 1]) : '';
const stCount = (s) => list.filter((l) => (s ? l._st.includes(s) : !l._st.length)).length;
const title = 'スクールガイド（小平の子どもの習い事）';
const desc = '小平の子どもの習い事の教室を、年齢・ジャンル・駅でしぼって探せるページ。';

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
  /* 白いページ。上に「さがす」（年齢・ジャンル・駅・無料体験）→ ジャンルごとの一覧（無料の行と、PRのカード）。
     色はサイトの色に、ジャンルの色と PR の色を足す（どれも白地で 4.5:1 以上） */
  :root {
    --pr-line:#E6B45E; --pr-bg:#FFFBF3; --pr-tag:#8A5A12; --pr-tag-bg:#FBEBC8;
    --perk-bg:#FDEEF1; --perk-ink:#93364F;
    --free-bg:#E4F2E1; --free-ink:#2E6A2B; --tr-bg:#F2F0EA; --tr-ink:#55636B;
    --g-taiso:#2F7A3D; --g-dance:#B4466F; --g-swim:#22799F; --g-ball:#94591A; --g-budo:#4A5A99;
    --g-music:#7A4FAA; --g-english:#1F6F8C; --g-art:#BB5530; --g-manabi:#2F7D71; --g-other:#5E6B73;
    --fab-bg:#2C3A42; --fab-ink:#FFFFFF;
  }
  /* 白いページに固定（2026-11-27 オーナー「スマホ設定の色にしないで。ホワイトページで見たい」）。
     サイト共通の色（明るいほう）を、端末が暗い設定のときにも当てる。地は白 */
  :root, :root[data-theme="dark"] { ${LIGHT} --ground:#FFFFFF; color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { ${LIGHT} --ground:#FFFFFF; color-scheme: light; }
    .bvnav { border-bottom-color: #E6E0D4; }
    .bvnav-links a { color: #44555F; }
    .bvnav-cal { background: #EAF4F8; color: #2C7C9E !important; }
    .bvnav-links a:hover, .bvnav-links a[aria-current="page"] { background: #EAF4F8; color: #2C7C9E; }
    .bvnav-sub { border-top-color: #EFEAE0; }
    .bvnav-sub a { background: #EAF4F8; color: #2C7C9E; }
    .bvnav-sub a[aria-current="page"] { background: #2C7C9E; color: #fff; }
  }
  /* 上のナビ: 1段目だけが場所をとり、2段目はその下に重ねる（下へ読み進めるあいだは隠す。ページの見出しは2段目のぶん下げる） */
  .bvnav-sub { position: absolute; left: 0; right: 0; top: 100%; background: #FFFFFF; border-bottom: 1px solid #E6E0D4; transition: opacity .18s, visibility .18s; }
  .bvnav.sub-off .bvnav-sub { opacity: 0; visibility: hidden; }
  .ghead { margin-top: var(--subh, 46px); }
  @media (prefers-reduced-motion: reduce) { .bvnav-sub { transition: none; } }
  /* 固定のナビは不透明に（下の文字が透けてにじむ） */
  .bvnav, .bvnav { background: #FFFFFF; -webkit-backdrop-filter: none; backdrop-filter: none; }

  main { padding: .4rem 0 5rem; }
  .ghead { background: var(--ground); border-bottom: 0; }
  .ghead-in { padding-top: 1rem; padding-bottom: .5rem; display: flex; align-items: baseline; flex-wrap: wrap; gap: .2rem .8rem; }
  .ghead h1 { font-size: clamp(1.6rem, 6vw, 2rem); margin: 0; }
  .count { font-size: .86rem; font-weight: 700; color: var(--ink-soft); }
  .count b { font-family: var(--maru); font-weight: 800; font-size: 1.35rem; color: var(--sky-deep); margin: 0 .15rem; font-variant-numeric: tabular-nums; }
  .nw { white-space: nowrap; }

  /* ── さがす ── */
  .finder { background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); box-shadow: 0 2px 14px rgba(52,67,76,.07); padding: .75rem .75rem .8rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .55rem; scroll-margin-top: 104px; }
  .finder > * { min-width: 0; }
  .f-lab { display: block; font-family: var(--maru); font-weight: 800; font-size: .8rem; color: var(--ink-soft); margin-bottom: .3rem; letter-spacing: .04em; }
  .seg { display: grid; grid-template-columns: .8fr 1fr 1.3fr 1fr; border: 1px solid var(--line-strong); border-radius: 12px; overflow: hidden; }
  .seg button { font: inherit; font-size: .82rem; font-weight: 700; min-height: 46px; padding: .2rem .1rem; border: 0; border-left: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); cursor: pointer; white-space: nowrap; }
  .seg button:first-child { border-left: 0; }
  .seg button[aria-pressed="true"] { background: var(--sky-deep); color: var(--on-sky); }
  .gt { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .35rem; }
  .gt button { font: inherit; display: flex; flex-direction: column; align-items: center; gap: .2rem; padding: .35rem .1rem .3rem; min-height: 54px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); color: var(--ink); cursor: pointer; }
  .gt button .gi { width: 30px; height: 30px; padding: 5px; border-radius: 999px; background: var(--surface-2); }
  .gt button .gl { font-size: .72rem; font-weight: 800; line-height: 1.2; white-space: nowrap; }
  .gt button .c { font-size: .66rem; color: var(--ink-soft); line-height: 1; margin-top: auto; font-variant-numeric: tabular-nums; }
  .gt button { position: relative; }
  .gt button[data-g][aria-pressed="true"] { color: #FFFFFF; }
  .gt button[aria-pressed="true"] .gi { background: rgba(255,255,255,.2); }
  .gt button[aria-pressed="true"] .c { color: #FFFFFF; }
  .gt button[aria-pressed="true"]::after { content: "✓"; position: absolute; top: 3px; right: 6px; font-size: .72rem; font-weight: 900; }
  ${GENRES.map((g) => `.gt button[data-g="${g.key}"][aria-pressed="true"] { background: var(--g-${g.key}); border-color: var(--g-${g.key}); }`).join('\n  ')}
  .gt button:disabled, .sc button:disabled { opacity: .35; cursor: default; }
  .sc { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
  .sc button { font: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem; min-height: 44px; padding: .2rem .1rem; font-size: .8rem; font-weight: 700; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); cursor: pointer; white-space: nowrap; line-height: 1.2; }
  .sc button .c { font-size: .66rem; color: var(--ink-soft); font-variant-numeric: tabular-nums; line-height: 1; }
  .sc button[aria-pressed="true"] { background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); }
  .sc button[aria-pressed="true"] .c { color: inherit; }
  .tog { display: flex; align-items: center; gap: .55rem; min-height: 44px; font-size: .88rem; font-weight: 700; cursor: pointer; }
  .tog input { width: 1.35rem; height: 1.35rem; accent-color: var(--sky-deep); margin: 0; flex: none; }
  .f-res { display: grid; gap: .35rem; }
  .cond { display: flex; flex-wrap: wrap; gap: .35rem; }
  .cc { font: inherit; display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; padding: 0 .55rem 0 .8rem; border-radius: 999px; border: 1px solid var(--sky-deep); background: var(--sky-wash); color: var(--link-ink); font-size: .82rem; font-weight: 800; cursor: pointer; }
  .cc span { font-size: 1rem; line-height: 1; }
  .res-row { display: flex; gap: .4rem; }
  .see { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; min-height: 50px; border-radius: 999px; background: var(--sky-deep); color: var(--on-sky); text-decoration: none; font-family: var(--maru); font-weight: 800; font-size: .98rem; }
  .see b { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
  .see .ui { width: 20px; height: 20px; }
  .rs { flex: none; font: inherit; font-size: .8rem; font-weight: 700; color: var(--link-ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: 0 .9rem; min-height: 50px; cursor: pointer; }
  button:focus-visible, a:focus-visible, .ph:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }

  /* ── 一覧 ── */
  .gs { scroll-margin-top: 104px; }
  h2.sec { display: flex; align-items: center; gap: .5rem; font-family: var(--maru); font-weight: 800; font-size: 1.1rem; margin: 1.1rem 0 .45rem; }
  h2.sec .gi { width: 32px; height: 32px; padding: 6px; border-radius: 999px; background: var(--surface-2); flex: none; }
  .sec-c { font-size: .78rem; color: var(--ink-soft); font-weight: 700; font-variant-numeric: tabular-nums; }
  .gi, .mi, .oi, .pi, .ui { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  ${GENRES.map((g) => `[data-genre="${g.key}"] .gi, .gt button[data-g="${g.key}"] { color: var(--g-${g.key}); }`).join('\n  ')}
  .list { background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: .6rem; }
  .row { display: flex; align-items: center; gap: .6rem; padding: .7rem .8rem .75rem .9rem; text-decoration: none; color: var(--ink); border-top: 1px solid var(--line); scroll-margin-top: 104px; }
  .list > .row:first-child { border-top: 0; }
  @media (hover: hover) { .row:hover { background: var(--surface-2); } }
  .row-b { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: .22rem; }
  .row-n { font-family: var(--maru); font-weight: 800; font-size: .98rem; line-height: 1.45; }
  .row-n, .prc-n, .row-m, .kv dd, .perk, .seat, .catch, .nt li, .chk { word-break: keep-all; overflow-wrap: anywhere; line-break: strict; }
  .row-m { display: flex; flex-direction: column; gap: .08rem; font-size: .8rem; line-height: 1.55; color: var(--ink-soft); }
  .mt { display: flex; align-items: flex-start; gap: .25rem; min-width: 0; }
  .mi { width: 14px; height: 14px; flex: none; margin-top: .2rem; color: var(--ink-soft); }
  .oi { width: 18px; height: 18px; flex: none; color: var(--ink-soft); }
  .tr { align-self: flex-start; font-size: .72rem; font-weight: 700; border-radius: 6px; padding: .05rem .45rem; background: var(--tr-bg); color: var(--tr-ink); }
  .tr-free { background: var(--free-bg); color: var(--free-ink); }
  .tr-none { background: none; color: var(--ink-soft); font-weight: 500; padding-left: 0; }
  .flag { display: inline-block; margin-left: .4rem; font-family: var(--body); font-size: .64rem; font-weight: 700; color: var(--ink-soft); border: 1px dashed var(--ink-soft); border-radius: 5px; padding: 0 .3rem; vertical-align: 2px; letter-spacing: 0; white-space: nowrap; }

  /* ── PRカード ── */
  .prc { background: var(--pr-bg); border: 1.5px solid var(--pr-line); border-radius: var(--radius-sm); margin: .7rem 0; overflow: hidden; box-shadow: 0 2px 14px rgba(138,90,18,.08); scroll-margin-top: 104px; }
  .prc-h { padding: .7rem .9rem .2rem; display: flex; flex-direction: column; gap: .25rem; }
  .prc-top { display: flex; align-items: center; gap: .4rem; }
  .prt { position: relative; font-weight: 800; font-size: .74rem; letter-spacing: .08em; color: var(--pr-tag); background: var(--pr-tag-bg); border-radius: 5px; padding: .05rem .45rem; text-decoration: none; }
  .prt::after { content: ""; position: absolute; inset: -9px -6px; }
  .prt .ii { width: 12px; height: 12px; margin-left: 3px; vertical-align: -1px; }
  .ii { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  .howto { justify-self: end; display: inline-flex; align-items: center; gap: .3rem; min-height: 44px; font-size: .76rem; font-weight: 700; color: var(--link-ink); text-decoration: none; }
  .howto .ii { width: 15px; height: 15px; }
  .lines { display: grid; gap: .05rem; }
  .lines .cls { display: block; font-size: .76rem; font-weight: 700; color: var(--ink-soft); margin-top: .2rem; }
  .lines .cls:first-child { margin-top: 0; }
  .lines .tm { display: block; }
  .from { display: none; font-size: .7rem; font-weight: 800; color: var(--ink); background: var(--surface-2); border-radius: 5px; padding: 0 .35rem; margin-right: .35rem; white-space: nowrap; }
  .age-on .from { display: inline-block; }
  .prc-top .flag { margin-left: 0; }
  .prc-n { font-family: var(--maru); font-weight: 800; font-size: 1.16rem; line-height: 1.4; margin: 0; }
  .seat { display: flex; align-items: flex-start; gap: .45rem; margin: .15rem 0 0; padding: .35rem .55rem; border-radius: 8px; background: var(--free-bg); color: var(--free-ink); font-size: .84rem; font-weight: 700; line-height: 1.5; }
  .seat b { flex: none; font-size: .72rem; background: var(--free-ink); color: #fff; border-radius: 4px; padding: .05rem .35rem; margin-top: .12rem; }
  .ph { display: flex; gap: .4rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: .55rem .9rem 0; -webkit-overflow-scrolling: touch; }
  .ph::-webkit-scrollbar { display: none; }
  .ph figure { margin: 0; flex: 0 0 82%; scroll-snap-align: start; border-radius: 10px; overflow: hidden; aspect-ratio: 16 / 10; max-width: 100%; }
  .ph figure svg { display: block; width: 100%; height: 100%; }
  .ph-cap { font-size: .7rem; color: var(--ink-soft); padding: .3rem .9rem 0; }
  .prc-b { padding: .6rem .9rem .9rem; display: grid; gap: .55rem; }
  .catch { font-size: .88rem; line-height: 1.75; margin: 0; padding-left: .7rem; border-left: 3px solid var(--pr-line); }
  .kvs { display: grid; gap: .3rem; margin: 0; padding: .6rem .7rem; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  .kv { display: grid; grid-template-columns: 4.6em minmax(0, 1fr); gap: .5rem; font-size: .86rem; line-height: 1.6; }
  .kv dt { color: var(--ink-soft); font-size: .76rem; font-weight: 700; padding-top: .1rem; }
  .kv dd { margin: 0; min-width: 0; }
  .perk { display: flex; gap: .5rem; align-items: flex-start; margin: 0; padding: .55rem .7rem; background: var(--perk-bg); color: var(--perk-ink); border-radius: 10px; font-size: .86rem; line-height: 1.6; font-weight: 700; }
  .perk b { display: block; font-size: .72rem; letter-spacing: .04em; }
  .pi { width: 22px; height: 22px; flex: none; margin-top: .1rem; }
  .nt { list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem; }
  .nt li { position: relative; padding-left: .9rem; font-size: .82rem; line-height: 1.65; color: var(--ink-soft); }
  .nt li::before { content: ""; position: absolute; left: .15rem; top: .65em; width: 5px; height: 5px; border-radius: 999px; background: var(--pr-line); }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 .8rem; border-radius: 999px; font-size: .88rem; font-weight: 800; text-decoration: none; color: var(--link-ink); background: var(--surface); border: 1px solid var(--line-strong); white-space: nowrap; }
  .btn-main { min-height: 50px; background: var(--sky-deep); border-color: var(--sky-deep); color: var(--on-sky); font-family: var(--maru); font-size: 1rem; }
  .acts { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem; }
  .chk { font-size: .72rem; color: var(--ink-soft); line-height: 1.6; }

  .none { text-align: center; padding: 1.4rem 1rem; background: var(--surface); border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); margin-top: 1rem; font-size: .9rem; }
  .none button { font: inherit; font-weight: 800; color: var(--link-ink); background: none; border: 0; text-decoration: underline; cursor: pointer; min-height: 44px; }
  .ask { margin-top: 1.6rem; padding: .85rem 1rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: .84rem; line-height: 1.8; color: var(--ink-soft); }
  .ask b { display: block; font-family: var(--maru); font-weight: 800; color: var(--ink); font-size: .95rem; margin-bottom: .2rem; }
  .about { margin-top: 1.4rem; scroll-margin-top: 104px; padding: .9rem 1rem; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
  .about h2 { font-family: var(--maru); font-weight: 800; font-size: 1rem; margin: 0 0 .5rem; }
  .about ul { list-style: none; margin: 0 0 .6rem; padding: 0; display: grid; gap: .45rem; }
  .about li { font-size: .84rem; line-height: 1.7; color: var(--ink-soft); word-break: keep-all; overflow-wrap: anywhere; }
  .about li b { display: block; color: var(--ink); font-size: .86rem; }
  .about p { font-size: .82rem; color: var(--ink-soft); line-height: 1.8; }
  .about a, .ask a { font-weight: 700; padding-block: 12px; margin-block: -12px; }
  .nav-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.6rem 0 0; }
  .nav-pills a { font-family: var(--maru); font-weight: 700; font-size: .84rem; text-decoration: none; color: var(--sky-deep); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: .4rem .9rem; }

  /* 下に浮かぶ「条件を変える」: さがすの枠が見えないとき、上に戻しているあいだだけ（読むじゃまをしない） */
  .fab { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 800; display: inline-flex; align-items: center; gap: .5rem; min-height: 48px; padding: 0 1.1rem; border-radius: 999px; background: var(--fab-bg); color: var(--fab-ink); font-size: .86rem; font-weight: 800; text-decoration: none; box-shadow: 0 6px 22px rgba(0,0,0,.22); white-space: nowrap; }
  .fab .ui { width: 18px; height: 18px; }
  .fab b { font-family: var(--maru); font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  .fab .sep { width: 1px; align-self: stretch; margin: .7rem 0; background: rgba(255,255,255,.35); }
  @media (min-width: 40rem) { .gt { grid-template-columns: repeat(10, minmax(0, 1fr)); } .sc { grid-template-columns: repeat(8, minmax(0, 1fr)); } .ph figure { flex-basis: 46%; } }
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
    <h1>スクールガイド</h1>
    <p class="count">掲載数<b>${n}</b>教室</p>
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
      <span class="f-lab" id="lab-g">習い事</span>
      <div class="gt" role="group" aria-labelledby="lab-g">
        ${byGenre.map(({ g, items }) => `<button type="button" data-g="${g.key}" aria-pressed="false" aria-label="${esc(g.short || g.label)}">${icon(g.key)}<span class="gl">${esc(g.short || g.label)}</span><span class="c">${items.length}</span></button>`).join('\n        ')}
      </div>
    </div>
    <div>
      <span class="f-lab" id="lab-st">駅</span>
      <div class="sc" role="group" aria-labelledby="lab-st">
        <button type="button" data-st="" aria-pressed="true">すべて</button>
        ${STATIONS.filter((s) => stCount(s)).map((s) => `<button type="button" data-st="${esc(s)}" aria-pressed="false">${esc(s)}<span class="c">${stCount(s)}</span></button>`).join('\n        ')}
        ${stCount('other') ? `<button type="button" data-st="other" aria-pressed="false">そのほか<span class="c">${stCount('other')}</span></button>` : ''}
      </div>
    </div>
    <label class="tog"><input type="checkbox" id="free-only">無料体験がある教室だけ</label>
    <div class="f-res">
      <div class="cond" id="cond" hidden></div>
      <div class="res-row">
        <a class="see" id="see" href="#results"><b id="cnt">${n}</b>教室を見る${SVG.down}</a>
        <button type="button" class="rs" id="reset" hidden>条件をもどす</button>
      </div>
      <a class="howto" href="#about">${SVG.info}載せ方について</a>
    </div>
  </section>

  <div id="results"></div>
  ${byGenre.map(({ g, items }) => section(g, items)).join('\n  ')}

  <div class="none" id="none" hidden>この条件に合う教室は、まだ載っていません。<br><button type="button" id="reset2">条件をもどす</button></div>

  <div class="ask">
    <b>教室の方へ</b>
    内容の直し、載せてほしくないとき（すぐに外します）、曜日や体験の日までくわしく載せたいときは、<a href="/#contact">お問い合わせ</a>からご連絡ください。
  </div>

  <section class="about" id="about">
    <h2>載せ方について</h2>
    <ul>
      <li><b>並び順</b>習い事ごとの五十音順です。PRかどうかで順番は変えません</li>
      <li><b>PR</b>掲載料をいただいた教室です。写真・曜日・費用・空き・体験の日を載せています</li>
      <li><b>PRのない教室</b>教室の案内に書いてあることだけを、無料で載せています${lastChecked ? `（${lastChecked}に確認）` : ''}</li>
      <li><b>駅エリア</b>駅の書いていない教室は、町の位置から近い駅のエリアに入れています</li>
      <li><b>申し込む前に</b>費用や曜日は変わることがあります。教室の案内でご確認ください</li>
    </ul>
    <p>内容の誤りに気づいたら、<a href="/#contact">お問い合わせ</a>から教えてください。</p>
  </section>

  <div class="nav-pills">
    <a href="/calendar.html">おでかけカレンダー</a>
    <a href="/teirei.html">児童館・図書館・子育てひろばの定例</a>
    <a href="/entei.html">こだいら幼稚園だより</a>
    <a href="/cafe.html">子連れで入りやすいカフェ</a>
  </div>
  <a class="back" href="/">← ぼんぼやーじゅ通信のトップへ</a>
</main>

<a class="fab" id="fab" href="#finder" hidden><span><b id="fabn">${n}</b>教室</span><span class="sep" aria-hidden="true"></span>${SVG.up}条件を変える</a>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  <a href="/tokushoho.html">免責事項・個人情報の取り扱い</a><br>
  © 2026 ぼんぼやーじゅ通信
</footer>

<script>
/* さがす: 年齢・ジャンル・駅・無料体験を組み合わせてしぼる。ボタンの数は、ほかの条件に合う教室の数 */
(function () {
  var st = { age: 'all', g: '', st: [], free: false };
  var AGE = ${JSON.stringify(AGES)};
  var items = [].slice.call(document.querySelectorAll('[data-item]'));
  var secs = [].slice.call(document.querySelectorAll('.gs'));
  var lists = [].slice.call(document.querySelectorAll('.list'));
  var $ = function (id) { return document.getElementById(id); };
  var has = function (el, attr, v) { return (' ' + el.getAttribute(attr) + ' ').indexOf(' ' + v + ' ') >= 0; };
  function ok(el, skip) {
    if (skip !== 'age' && st.age !== 'all' && el.getAttribute('data-ages') !== '?' && !has(el, 'data-ages', st.age)) return false;
    if (skip !== 'g' && st.g && el.getAttribute('data-genre') !== st.g) return false;
    if (skip !== 'st' && st.st.length && !st.st.some(function (s) { return has(el, 'data-st', s); })) return false;
    if (skip !== 'free' && st.free && el.getAttribute('data-trial') !== 'free') return false;
    return true;
  }
  function count(test, skip) { var c = 0; items.forEach(function (el) { if (test(el) && ok(el, skip)) c++; }); return c; }
  function apply() {
    var n = 0;
    items.forEach(function (el) { var on = ok(el); el.hidden = !on; if (on) n++; });
    lists.forEach(function (l) {
      var vis = [].slice.call(l.querySelectorAll('.row')).filter(function (r) { return !r.hidden; });
      l.hidden = !vis.length; vis.forEach(function (r, i) { r.style.borderTopWidth = i ? '' : '0'; });
    });
    secs.forEach(function (s) { var c = s.querySelectorAll('[data-item]:not([hidden])').length; s.hidden = !c; var sc = s.querySelector('[data-sec-count]'); if (sc) sc.textContent = c; });
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-age') === st.age ? 'true' : 'false'); });
    document.querySelectorAll('.gt button').forEach(function (b) {
      var g = b.getAttribute('data-g'), c = count(function (el) { return el.getAttribute('data-genre') === g; }, 'g');
      b.querySelector('.c').textContent = c; b.setAttribute('aria-pressed', st.g === g ? 'true' : 'false'); b.disabled = !c && st.g !== g;
    });
    document.querySelectorAll('.sc button').forEach(function (b) {
      var s = b.getAttribute('data-st'), cc = b.querySelector('.c');
      var on = s ? st.st.indexOf(s) >= 0 : !st.st.length;
      if (s) { var c = count(function (el) { return has(el, 'data-st', s); }, 'st'); cc.textContent = c; b.disabled = !c && !on; }
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('free-only').checked = st.free;
    document.body.classList.toggle('age-on', st.age !== 'all');
    var cond = [];
    if (st.age !== 'all') cond.push(['age', AGE[st.age]]);
    if (st.g) cond.push(['g', document.querySelector('.gt button[data-g="' + st.g + '"]').getAttribute('aria-label')]);
    st.st.forEach(function (s) { cond.push(['st:' + s, s === 'other' ? 'そのほか・駅の記載なし' : s + '駅']); });
    if (st.free) cond.push(['free', '無料体験あり']);
    $('cnt').textContent = n; $('fabn').textContent = n;
    $('cond').innerHTML = cond.map(function (c) { return '<button type="button" class="cc" data-k="' + c[0] + '" aria-label="' + c[1] + 'の条件を外す">' + c[1] + '<span aria-hidden="true">×</span></button>'; }).join('');
    $('cond').hidden = !cond.length;
    $('reset').hidden = !cond.length;
    $('none').hidden = n > 0;
    $('see').hidden = !n;
  }
  document.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { st.age = b.getAttribute('data-age'); apply(); }); });
  document.querySelectorAll('.gt button').forEach(function (b) { b.addEventListener('click', function () { var g = b.getAttribute('data-g'); st.g = st.g === g ? '' : g; apply(); }); });
  document.querySelectorAll('.sc button').forEach(function (b) { b.addEventListener('click', function () {
    var s = b.getAttribute('data-st'), i = st.st.indexOf(s);
    if (!s) st.st = []; else if (i >= 0) st.st.splice(i, 1); else st.st.push(s);
    apply();
  }); });
  $('free-only').addEventListener('change', function (e) { st.free = e.target.checked; apply(); });
  function reset() { st = { age: 'all', g: '', st: [], free: false }; apply(); }
  $('cond').addEventListener('click', function (e) {
    var b = e.target.closest('.cc'); if (!b) return;
    var k = b.getAttribute('data-k');
    if (k === 'age') st.age = 'all'; else if (k === 'free') st.free = false; else if (k.indexOf('st:') === 0) st.st.splice(st.st.indexOf(k.slice(3)), 1); else st[k] = '';
    apply();
  });
  $('reset').addEventListener('click', reset); $('reset2').addEventListener('click', reset);
  /* 「〇教室を見る」: いちばん上に出ている教室のジャンルへ */
  $('see').addEventListener('click', function (e) {
    var first = document.querySelector('.gs:not([hidden])'); if (!first) return;
    e.preventDefault(); first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  /* 下に浮かぶ「条件を変える」: さがすの枠が上に外れていて、上へ戻しているあいだだけ出す。
     上のナビの2段目も、下へ読み進めるあいだは隠す（読む画面を広く。上へ戻すと出る） */
  var fab = $('fab'), finder = $('finder'), nav = document.querySelector('.bvnav'), sub = document.querySelector('.bvnav-sub'), lastY = window.scrollY;
  if (sub) document.documentElement.style.setProperty('--subh', sub.offsetHeight + 'px');
  window.addEventListener('scroll', function () {
    var y = window.scrollY, past = finder.getBoundingClientRect().bottom < 0;
    if (!past || y > lastY + 6) fab.hidden = true; else if (y < lastY - 6) fab.hidden = false;
    if (nav) { if (y > 140 && y > lastY + 6) nav.classList.add('sub-off'); else if (y < 140 || y < lastY - 6) nav.classList.remove('sub-off'); }
    lastY = y;
  }, { passive: true });
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
console.log(`wrote ${out}（${n}件 / ${byGenre.map(({ g, items }) => `${g.label}${items.length}`).join('・')} / 駅: ${STATIONS.map((s) => `${s}${stCount(s)}`).join('・')}・そのほか${stCount('other')}・駅なし${stCount('')}）`);
if (skipped.length) console.log(`  ${PREVIEW ? '確認中で入れたもの' : '確認中で外したもの'}: ${skipped.map((l) => l.name).join('・')}`);
