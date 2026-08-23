#!/usr/bin/env node
/*
 * 台帳 events/*.md を、カレンダー表示用の JSON に変換する。
 *   node scripts/build-events-json.mjs
 *
 * 入力:  events/2026-*.md（`### E12. 名前` 単位。日時欄は自由記述）
 * 出力:  data/events.json（★リポジトリ内のみ。docs/homepage の外なので公開されない）
 *
 * 設計の要:
 *   - 日時欄は人が書いた自由文なので、**確定日が取れないものを黙って落とさない**。
 *     取れたものは events[]、取れなかったものは unresolved[] に理由つきで残す。
 *     （事故#4「巡回0件に誰も気づかなかった」の再発防止。落ちた件数を必ず表示する）
 *   - `例年` `要確認` を含む日時は日付が取れても tentative=true にして、
 *     カレンダーのマス目には置かない（確定情報だけを日付に載せる方針）。
 *   - ステータス `終了` `見送り` は除外する。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const OUT = 'data/events.json';   // ★docs/homepage の外＝公開されない（全件を持つ）
// 台帳の年。ファイル名 events/YYYY-MM.md から取り、月が繰り上がる場合に使う
const BASE_YEAR = 2026;

// ---- 台帳ファイルを集める（2026-07.md, 2026-08.md, ... 昇順）----
const files = readdirSync('events')
  .filter((f) => /^\d{4}-\d{2}\.md$/.test(f))
  .sort()
  .map((f) => `events/${f}`);

// ---- ユーティリティ ----------------------------------------------------------

// 全角数字・記号を半角に寄せる（台帳に「①」「〜」「：」が混じる）
const normalize = (s) =>
  s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[〜～]/g, '~')
    .replace(/[（）]/g, (c) => (c === '（' ? '(' : ')'))
    .replace(/：/g, ':');

// 「8/23」→ 2026-08-23。月が7より小さいものは翌年（台帳は7月始まり）
function toISO(month, day) {
  const y = month >= 7 ? BASE_YEAR : BASE_YEAR + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 日付を1日進める / 2日付の間の日数
const nextDay = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// 日時欄から日付を拾う。位置つきで拾ってから「~」でつながれた区間を展開する。
//   「8/22(土)・23(日)」      → 2日（・区切りは展開しない）
//   「8/18(火)~23(日)」       → 6日（区間なので全日展開する）
//   「~10/14(水)まで」        → 会期もの。span として返し、マス目には置かない
//   「8/8(土)~15(土)は毎日、ほか8/1・8/22」→ 区間8日 + 単発2日
// 長い会期（LONG_SPAN 日超）は日ごとに展開せず span にする（カレンダーが埋まって読めなくなる）。
const LONG_SPAN = 14;

function extractDates(raw) {
  const s = normalize(raw);
  const hits = [];                  // {iso, at, sep} sep = 直前の区切り文字
  let lastMonth = null;
  const re = /(\d{1,2})\/(\d{1,2})|(?<![\d\/])(\d{1,2})\((?:月|火|水|木|金|土|日)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let iso = null;
    if (m[1]) {
      lastMonth = Number(m[1]);
      iso = toISO(lastMonth, Number(m[2]));
    } else if (m[3] && lastMonth != null) {
      iso = toISO(lastMonth, Number(m[3]));
    }
    if (!iso) continue;
    // 直前の非空白文字が「~」なら区間の終端
    const before = s.slice(0, m.index).replace(/[\s(月火水木金土日)]*$/, '');
    hits.push({ iso, range: before.endsWith('~') });
  }
  if (!hits.length) return { dates: [], span: null };

  // 先頭が「~10/14まで」形式（開始日が書かれていない会期）
  if (hits[0].range) {
    return { dates: [], span: { from: null, to: hits[0].iso } };
  }

  const dates = [];
  let span = null;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (h.range && dates.length) {
      const from = dates[dates.length - 1];
      const len = daysBetween(from, h.iso);
      if (len > 0 && len <= LONG_SPAN) {
        for (let d = nextDay(from); ; d = nextDay(d)) {
          dates.push(d);
          if (d === h.iso) break;
        }
      } else if (len > LONG_SPAN) {
        span = { from, to: h.iso };   // 長い会期は展開しない
      } else {
        dates.push(h.iso);           // 逆順など不正な区間はそのまま1日として扱う
      }
    } else {
      dates.push(h.iso);
    }
  }
  return { dates: [...new Set(dates)].sort(), span };
}

// 「10:00~13:00」「18:30~」「14:00開演」から時刻を拾う
function extractTime(raw) {
  const s = normalize(raw);
  const range = s.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (range) return { start: `${pad(range[1])}:${range[2]}`, end: `${pad(range[3])}:${range[4]}` };
  const one = s.match(/(\d{1,2}):(\d{2})/);
  if (one) return { start: `${pad(one[1])}:${one[2]}`, end: null };
  return { start: null, end: null };
}
const pad = (n) => String(n).padStart(2, '0');

// 「8/28(金)まで」「8/24(月)まで」「8/5(水)~28(金)」から締切を拾う。
// ★申込期間は「いちばん後ろの日付」が締切。extractDates は長い区間を span に落とすので、
//   span.to も候補に入れないと、期間の**開始日**を締切と読み違える。
//   （E48「申込: 8/5(水)~28(金)」を 8/5 と読んで、8/28 の締切を落としていた）
function extractDeadline(lines) {
  for (const l of lines) {
    if (!/申込|締切|応募/.test(l)) continue;
    const s = normalize(l);
    const { dates, span } = extractDates(s);
    const cands = dates.concat(span && span.to ? [span.to] : []);
    if (!cands.length) continue;
    if (/締切|まで|先着|抽選/.test(s)) {
      return { date: cands.reduce((a, b) => (a > b ? a : b)), raw: l.trim() };
    }
  }
  return null;
}

// 子連れ欄「👶○ 🧒◎ 🎒◎」を3カテゴリに割る
function parseAges(raw) {
  if (!raw) return null;
  const grab = (emoji) => {
    const m = raw.match(new RegExp(emoji + '\\s*([◎○△✕x])'));
    return m ? m[1] : null;
  };
  const a = { baby: grab('👶'), pre: grab('🧒'), elem: grab('🎒') };
  return a.baby || a.pre || a.elem ? a : null;
}

// 見出し「### E47. こだいら防災救急フェア ★穴場」→ id と名前（★以降の内部メモは落とす）
function parseHeading(line) {
  const m = line.match(/^###\s+(E\d+)\.\s*(.+?)\s*$/);
  if (!m) return null;
  let name = m[2]
    .replace(/\s*★.*$/, '')            // ★地元最重要 などの内部マーカー
    .replace(/\s*※.*$/, '')
    .replace(/\s*\(第\d+回\)\s*$/, '')  // (第47回) は残しても良いが日付表示が長くなるため落とす
    .trim();
  return { id: m[1], name };
}

// 1行の「- キー: 値」を取る
function field(lines, keys) {
  for (const key of keys) {
    for (const l of lines) {
      const m = l.match(new RegExp('^\\s*-\\s*(?:\\*\\*)?' + key + '(?:\\*\\*)?\\s*:\\s*(.+)$'));
      if (m) return m[1].replace(/\*\*/g, '').trim();
    }
  }
  return '';
}

// URL は 「- URL:」優先、無ければ本文中の最初の http
function findURL(lines) {
  const u = field(lines, ['URL', '出典']);
  const m1 = u.match(/https?:\/\/\S+/);
  if (m1) return m1[0].replace(/[)、。]+$/, '');
  for (const l of lines) {
    if (/^\s*-\s*(確度|ステータス)/.test(l)) continue;
    const m = l.match(/https?:\/\/\S+/);
    if (m) return m[0].replace(/[)、。]+$/, '');
  }
  return '';
}

// 場所から地図検索に使う語を作る。
// 台帳の「場所」欄は所在地と行き方・費用・講師名が同居している:
//   「西東京市緑町/車・自転車約10分」「ルネこだいら 中ホール / 費用: 無料」
//   「東村山乗換 西武園駅すぐ/電車約20〜25分」
// そのまま地図に投げると場所ではなく行き方を検索してしまう。地名だけを残す。
function mapQuery(place) {
  if (!place) return '';
  let q = place
    .split(/[、,]/)[0]
    .split(/\s*[／/]\s*/)[0]          // 「◯◯ / 費用: 無料」「◯◯/車で10分」の右側を捨てる
    .split(/\s*[—–―]\s*/)[0]         // 「◯◯ — 花小金井から徒歩」
    .split(/・/)[0]                    // 「中央公民館…・中央図書館…」は先頭の1つに絞る
    .replace(/\(.*?\)/g, '')
    .replace(/[（(].*$/, '')           // 閉じ括弧が無いまま続くもの（台帳に実在する）
    .replace(/[※].*$/, '')
    .replace(/\s*(?:費用|料金|講師|問合せ|定員|対象)\s*[:：].*$/, '')
    .replace(/^\S+?乗換\s*/, '')       // 「東村山乗換 西武園駅すぐ」→「西武園駅すぐ」
    .replace(/\s*(?:徒歩|車|バス|自転車)\s*(?:約)?\d+[〜~]?\d*分.*$/, '')  // 「狭山市駅 徒歩10分」
    .replace(/(駅)\s*(?:すぐ|前|直結|徒歩圏).*$/, '$1')                      // 「西武園駅すぐ」→「西武園駅」
    .replace(/\s*(ほか|など|周辺|一帯|沿い\d*会場)\s*$/, '')
    .trim();
  // 行き方だけが残ってしまった場合は、地図に投げない（誤った場所を出すより出さない）
  if (!q || /^(?:電車|車|バス|自転車|徒歩)/.test(q) || /約\d+[〜~]?\d*分$/.test(q)) return '';
  return q;
}


// ---- 読者に見せる文から、台帳の内部メモを落とす ------------------------------
// 台帳の「子連れ」「内容」欄には、運営用の記号やメモが混ざっている。
//   「◎◎ E7参照。」「✕に近い△」「無料版の『知らないと損』枠に使える」
// これがそのまま公開ページに出ていた（.ics の説明欄にも入って読者のカレンダーに残る）。
// 記号は読者向けの言い方に寄せ、運営メモは削る。
const STRIP = [
  [/E\d+\s*参照。?\s*/g, ''],           // 台帳ID同士の相互参照
  [/◎◎/g, '◎'],                          // 内部の強調（読者には◎で十分）
  [/✕に近い△/g, '△'],
  [/[✕x]\s*に近い/g, ''],
  [/[✕x]\s*[~〜]\s*(?=[◎○△])/g, ''],   // 「✕〜△」→「△」（内部の幅つき評価）
  [/(?<![\w])[✕x](?=\s*[^\S\r\n]*[◎○△])/g, ''],
  [/[，、]?\s*(?:無料版|有料版)の?「[^」]*」枠に(?:使える|できる)。?/g, ''],
  [/「[^」]*」ネタとして再利用可。?/g, ''],
  [/。?\s*(?:常設|通年)なので[^。]*再利用[^。]*。?/g, ''],
];
// 落としきれなかったときに気づくための番兵。読者向けの文にこれが残っていたら公開しない。
// 「損」は方針で禁じている煽り表現。台帳IDと内部記号も読者には意味がない。
const FORBIDDEN = /損|E\d+\s*参照|◎◎|✕/;

function readerText(s) {
  if (!s) return '';
  let out = String(s);
  for (const [re, to] of STRIP) out = out.replace(re, to);
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ---- 台帳を1件ずつ読む ------------------------------------------------------

const events = [];
const standing = [];
const unresolved = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // 見出しごとにブロックへ切る
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const h = parseHeading(line);
    if (h) {
      cur = { ...h, file, lines: [] };
      blocks.push(cur);
    } else if (cur) {
      if (/^##\s/.test(line)) cur = null;   // 次の大見出しで打ち切り
      else cur.lines.push(line);
    }
  }

  for (const b of blocks) {
    const when = field(b.lines, ['日時', '会期', '日程']);
    const spanField = field(b.lines, ['期間']);           // 「例年7月上旬〜9月上旬」など季節もの
    const status = (field(b.lines, ['ステータス']) ||
      (b.lines.find((l) => /ステータス\s*:/.test(l)) || '').split(/ステータス\s*:/)[1] || '').trim();
    const confidence = (field(b.lines, ['確度']) || '').split(/\s*\/\s*ステータス/)[0].trim();
    const isStanding = /〔常設〕|^\s*常設/.test(b.name) || /常設/.test(status) || (!when && !!spanField);

    // 終了・見送りは載せない
    if (/終了|見送り/.test(status)) {
      unresolved.push({ id: b.id, name: b.name, reason: `ステータス「${status.split(/\s/)[0]}」のため除外`, when });
      continue;
    }

    // 常設・季節もの（プール・水遊び・スタンプカード等）は日付を持たない。
    // カレンダーのマス目には置かず「いつでも行ける定番」として別枠に出す。
    if (isStanding) {
      standing.push({
        id: b.id,
        name: b.name.replace(/^〔常設〕\s*/, ''),
        span: spanField || when || '通年',
        place: field(b.lines, ['場所', '会場']),
        mapq: mapQuery(field(b.lines, ['場所', '会場'])),
        summary: readerText(field(b.lines, ['内容']) || field(b.lines, ['子連れ'])),
        kidsNote: readerText(field(b.lines, ['子連れ'])),
        ages: parseAges(field(b.lines, ['子連れ'])),
        cost: field(b.lines, ['料金', '費用', '参加費']),
        url: findURL(b.lines),
        confidence,
        source: b.file,
      });
      continue;
    }

    if (!when) {
      unresolved.push({ id: b.id, name: b.name, reason: '日時・期間の行が無い', when: '' });
      continue;
    }

    const { dates, span } = extractDates(when);  // span = 長い会期（マス目に置かない）
    if (!dates.length && !span) {
      unresolved.push({ id: b.id, name: b.name, reason: '日時から確定日が取れない', when });
      continue;
    }

    // 「例年」「要確認」を含むものは日付が取れても暫定扱い
    const tentative = /例年|要確認|見込み|未定|可能性/.test(when) || /要確認|中|低/.test(confidence);
    const place = field(b.lines, ['場所', '会場']);
    const { start, end } = extractTime(when);

    events.push({
      id: b.id,
      name: b.name,
      dates,
      span,
      when,
      start,
      end,
      allDay: !start,
      place,
      mapq: mapQuery(place),
      summary: readerText(field(b.lines, ['内容']) || field(b.lines, ['子連れ'])),
      kidsNote: readerText(field(b.lines, ['子連れ'])),
      ages: parseAges(field(b.lines, ['子連れ'])),
      cost: field(b.lines, ['料金', '費用', '参加費']),
      target: field(b.lines, ['対象']),
      url: findURL(b.lines),
      status: status.split(/\s|\(/)[0] || '候補',
      confidence,
      tentative,
      deadline: extractDeadline(b.lines),
      source: b.file,
    });
  }
}

// ---- 番兵: 読者向けの文に内部メモが残っていたら、公開対象から外す ----------
// 「システムが自力で検出したものは1件もない」（事故の記録）ので、ここで機械に見張らせる。
// 消すのではなく外して理由を出す。台帳を直せば次回から載る。
function screen(list, label) {
  const keep = [];
  for (const e of list) {
    const hit = ['name', 'summary', 'kidsNote'].find((k) => e[k] && FORBIDDEN.test(e[k]));
    if (hit) {
      unresolved.push({
        id: e.id, name: e.name,
        reason: `読者向けの ${hit} に内部メモが残っている（公開しない）: 「${String(e[hit]).slice(0, 40)}」`,
        when: e.when || '',
      });
    } else keep.push(e);
  }
  return keep;
}
{
  const beforeE = events.length, beforeS = standing.length;
  const okE = screen(events, 'events');
  events.length = 0; events.push(...okE);
  const okS = screen(standing, 'standing');
  standing.length = 0; standing.push(...okS);
  if (beforeE !== events.length || beforeS !== standing.length) {
    console.log(`  ⚠ 内部メモが残っていたため ${beforeE - events.length + beforeS - standing.length}件を公開対象から外した`);
  }
}

// 同じ日に複数日ぶら下がるイベントは、日付ごとの索引も作っておく（カレンダー描画用）
events.sort((a, b) => (a.dates[0] || '').localeCompare(b.dates[0] || '') || a.id.localeCompare(b.id));

const byDate = {};
for (const e of events) {
  if (e.tentative) continue;              // 暫定はマス目に置かない
  for (const d of e.dates) (byDate[d] ||= []).push(e.id);
}

mkdirSync('data', { recursive: true });
const payload = { generated: new Date().toISOString().slice(0, 10), events, standing, byDate, unresolved };
writeFileSync(OUT, JSON.stringify(payload, null, 1));

// ---- 落ちたものを必ず表示する（黙って0件にしない）--------------------------
const firm = events.filter((e) => !e.tentative).length;
console.log(`wrote ${OUT}`);
console.log(`  確定 ${firm}件 / 暫定 ${events.length - firm}件 / 常設・季節 ${standing.length}件 / 載せられなかったもの ${unresolved.length}件`);
for (const u of unresolved) console.log(`  - ${u.id} ${u.name}: ${u.reason}${u.when ? ` 「${u.when}」` : ''}`);
