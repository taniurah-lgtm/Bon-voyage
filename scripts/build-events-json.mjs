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

// 日付そのものが未確定かを判定する。時刻についての注記は取り除いてから見る。
function isDateVague(when) {
  if (!when) return true;
  const w = normalize(when)
    // 時刻の話をしている括弧・※注記を落とす
    .replace(/[（(][^）)]*(?:\d{1,2}:\d{2}|時間|時刻|開場|開演|開始|終了)[^）)]*[）)]/g, '')
    .replace(/※[^※]*(?:時間|時刻|開場|開演|開始|終了)[^※]*/g, '');
  return /例年|見込み|未定|可能性/.test(w) || /(?:日程|開催日|日にち)[^。]{0,8}要確認/.test(w) || /^\s*要確認/.test(w);
}

// 日時欄の ※注記を拾う。「※荒天時は中止の場合あり(中止は小平消防署HPで告知)」
// のような、当日の判断にいちばん効く情報が本文に出ていなかった。
function extractCaution(raw) {
  if (!raw) return '';
  const notes = [];
  const re = /※\s*([^※]+)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const t = m[1].trim();
    // 日別の例外時刻は別に扱うので、ここでは拾わない
    if (/^\d{1,2}日は\s*\d{1,2}:\d{2}/.test(t)) continue;
    // 運営の記録（「2026-07 に確定」「2026-08-15検証」）は読者には意味がなく、
    // ⚠️ の記号を無駄に消費する
    if (/^\d{4}-\d{2}(-\d{2})?\s*(に)?(確定|検証|訂正|確認)/.test(t)) continue;
    if (/^台帳|^起票|^スクショ/.test(t)) continue;
    if (t) notes.push(t);
  }
  return notes.join(' / ');
}

// 「花火は8/29(土)20:00〜20:30」のように、特定の日だけのプログラムを拾う。
// ★これを一般の開催時刻として扱うと、8/30 のカードにも「20:00〜20:30」が出て、
//   読者のカレンダーに「8/30 20:00 花火」という無い予定が入る。
function extractPrograms(raw, dates) {
  const s = normalize(raw || '');
  const out = {};
  const re = /([^、。\s]{1,14})は\s*(\d{1,2})\/(\d{1,2})\s*\([^)]*\)\s*(\d{1,2}):(\d{2})\s*(?:~\s*(\d{1,2}):(\d{2}))?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const iso = toISO(Number(m[2]), Number(m[3]));
    if (dates && dates.length && !dates.includes(iso)) continue;
    out[iso] = {
      label: m[1].replace(/^[、。]/, '').trim(),
      start: `${pad(m[4])}:${m[5]}`,
      end: m[6] ? `${pad(m[6])}:${m[7]}` : null,
    };
  }
  return Object.keys(out).length ? out : null;
}

// 日別の例外時刻を拾う。
//   「8/18(火)~23(日) 10:00~17:00 ※23日は16:00まで」
//     → 23日だけ終わりが16:00。これを見落とすと、読者のカレンダーに
//       1時間ずれた終了時刻が入る（E44で実際にそうなっていた）。
function extractExceptions(raw, dates) {
  const s = normalize(raw);
  const out = {};
  const re = /※\s*(\d{1,2})日は\s*(\d{1,2}):(\d{2})\s*(まで|から)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const day = Number(m[1]);
    const time = `${pad(m[2])}:${m[3]}`;
    // 展開済みの日付の中から、その「日」に当たるものを探す
    const hit = (dates || []).find((d) => Number(d.slice(8, 10)) === day);
    if (!hit) continue;
    out[hit] = m[4] === 'まで' ? { end: time } : { start: time };
  }
  return Object.keys(out).length ? out : null;
}

// 「10:00~13:00」「18:30~」「14:00開演」から時刻を拾う
function extractTime(raw) {
  const s = normalize(raw);
  // ★その時刻が「確かなもの」かを見る。
  //   「(例年15:00~21:00、時間要確認)」は例年の目安で、今年の確定時刻ではない。
  //   確定として出すと、読者のカレンダーに未確認の時刻がそのまま入る。
  const uncertain = /(?:時間|時刻|開場|開演)\s*(?:が)?\s*要確認/.test(s) ||
    /[（(][^）)]*例年[^）)]*\d{1,2}:\d{2}[^）)]*[）)]/.test(s) ||
    /[（(][^）)]*\d{1,2}:\d{2}[^）)]*要確認[^）)]*[）)]/.test(s);
  const range = s.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (range) {
    return { start: `${pad(range[1])}:${range[2]}`, end: `${pad(range[3])}:${range[4]}`, uncertain };
  }
  // 台帳には「10:00〜正午」という書き方がある。終了時刻として読めないと
  // 「終了時刻は未公表」扱いになり、2時間の仮置きが入る（正午と書いてあるのに）。
  const noon = s.match(/(\d{1,2}):(\d{2})\s*~\s*正午/);
  if (noon) return { start: `${pad(noon[1])}:${noon[2]}`, end: '12:00', uncertain };
  const one = s.match(/(\d{1,2}):(\d{2})/);
  if (one) return { start: `${pad(one[1])}:${one[2]}`, end: null, uncertain };
  return { start: null, end: null, uncertain: false };
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
      // 読者のカレンダーの説明欄にそのまま入るので、台帳の記法を落とす
      const raw = l
        .replace(/^\s*-\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^(?:申込|応募)\s*[:：]\s*/, '')
        .trim();
      return { date: cands.reduce((a, b) => (a > b ? a : b)), raw };
    }
  }
  return null;
}

// 開館時間・休館日を拾う。台帳が「⚠️ 雨の日の逃げ場として案内するとき、金曜だけは
// 使えない」とわざわざ警告しているのに、ページに「金曜」「休館」が1文字も出ていなかった。
// 雨の金曜に向かうと閉まっている、という事故につながる。
function extractHours(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!/開館時間|休館/.test(lines[i])) continue;
    // 台帳の箇条書きは折り返して次の行に続くことがある。
    // 「休館日は『金曜日』」は続きの行に書かれていて、1行だけ見ると拾えない。
    let buf = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*[-*+]\s/.test(lines[j]) || /^\s*$/.test(lines[j]) || /^###?\s/.test(lines[j])) break;
      buf += ' ' + lines[j].trim();
    }
    const v = buf
      .replace(/^\s*-\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^[^:：]*[:：]\s*/, '')
      .replace(/\s*[（(]\d{4}-\d{2}-\d{2}[^）)]*[）)]/g, '')
      .replace(/\s*→[\s\S]*$/, '')             // 「→ ⚠️ …曜日を必ず確認する」は運営向けの注意
      .replace(/出典\s*[:：]\s*\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (v) return v;
  }
  return '';
}

// 「(最終入場16:40)」「(最終受付16:30)」を拾う。先着・定員ものでは行動に直結する。
function extractLastEntry(raw) {
  const m = normalize(raw || '').match(/[（(]?\s*(最終(?:入場|受付|入館|受け付け)\s*\d{1,2}:\d{2})\s*[）)]?/);
  return m ? m[1] : '';
}

// 問合せ先の電話を拾う。締切を知らせるとき、申込フォームのURLが無い催しでも
// 電話が分かれば申し込める（台帳には「問合せ: 文化スポーツ課 042-346-9612」がある）。
function extractContact(lines) {
  for (const l of lines) {
    if (!/問合せ|問い合わせ|申込|連絡/.test(l)) continue;
    const m = l.match(/0\d{1,4}-\d{2,4}-\d{3,4}/);
    if (m) {
      const who = (l.match(/(?:問合せ|問い合わせ)\s*[:：]\s*([^0-9]{1,24})/) || [])[1] || '';
      return { tel: m[0], who: who.replace(/\*\*/g, '').trim() };
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
  if (a.baby || a.pre || a.elem) return a;
  // ★古い書式（E22〜E43）は絵文字を使わず「◎」「△〜○」「✕に近い△」だけを書く。
  //   ここを読まないと、次の週末のカードの大半で年齢の目安が丸ごと消える。
  //   「タップすると年齢の目安が出ます」と書いてあるのに出ない状態だった。
  const m = String(raw).trim().match(/^(✕に近い△|[◎○△✕x]\s*[〜~]\s*[◎○△✕x]|◎◎|[◎○△✕x])/u);
  if (!m) return null;
  const overall = m[1].replace(/\s/g, '').replace(/^◎◎$/, '◎');
  return { overall };
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
    for (let i = 0; i < lines.length; i++) {
      // ★ラベルの後ろの丸括弧注記を許す。台帳には「日時(2026確定):」「会期(暫定):」
      //   のような書き方が実際にあり、これを弾いていたため E7（西武園の花火・
      //   公式で確認済み・9/19〜23も開催）が丸ごと落ちていた。全角コロンも許す。
      const m = lines[i].match(new RegExp(
        '^\\s*[-*+]\\s*(?:\\*\\*)?' + key + '(?:\\s*[（(][^）)]*[）)])?(?:\\*\\*)?\\s*[:：]\\s*(.+)$'
      ));
      if (!m) continue;
      // 台帳の箇条書きは折り返して次の行に続く。続きを読まないと、
      // 「スーパーボールすくいは2歳でも親の膝上でいける」のような
      // 2歳連れにいちばん効く一文が落ちる。
      let buf = m[1];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*[-*+]\s/.test(lines[j]) || /^\s*$/.test(lines[j]) || /^#{1,3}\s/.test(lines[j])) break;
        if (/^\s*>/.test(lines[j])) break;
        buf += ' ' + lines[j].trim();
      }
      return buf.replace(/\*\*/g, '').trim();
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
    if (/^\s*[-*+]\s*(確度|ステータス)/.test(l)) continue;
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
function mapQuery(place, name) {
  if (!place && !name) return '';
  if (!place) return facilityQuery(name);
  let q = place
    // 「ビル4・5階」の階表記は、下の「・」分割より先に落とす（「ビル4」が残ってしまう）
    .replace(/\s*\d+(?:\s*[・･]\s*\d+)*\s*(?:階|F)(?![a-zA-Z])/g, '')
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
  // 「中央公民館1階ギャラリー」→「中央公民館」。階・室名は地図の検索を外す
  q = q.replace(/\s*\d+\s*(?:階|F)\s*\S*$/, '').replace(/\s*(?:ギャラリー|視聴覚室|展示ギャラリー|中ホール|大ホール|センターコート)\s*$/, '').trim();
  // 行き方だけが残ってしまった場合は、地図に投げない（誤った場所を出すより出さない）
  if (!q || /^(?:電車|車|バス|自転車|徒歩)/.test(q) || /約\d+[〜~]?\d*分$/.test(q)) return '';
  // 「中央公民館」だけでは全国にあるので、住所の町名から市名を足す。
  // ★判定は place の全文ではなく「括弧の中の住所」だけを見る。全文で見ると
  //   行き方メモの「花小金井からバス」に反応して「小平市三鷹駅南口商店街」のような
  //   実在しない地名を作ってしまう。
  const paren = (place.match(/[（(]([^）)]*)[）)]/) || [])[1] || '';
  // 括弧の中は「住所」のことも「行き方」のこともある。
  //   住所  : 「小川町2-1325」          → 市名を足してよい
  //   行き方: 「花小金井からバス 約30分」→ 足すと「小平市三鷹駅南口商店街」のような
  //                                        実在しない地名になる
  const looksLikeRoute = /から|約|分|乗換|徒歩|バス|電車|直行|下車/.test(paren);
  const looksLikeAddr = /(?:町|丁目)\s*\d|(?:\d+-\d+)|町$|丁目$/.test(paren);
  const KODAIRA = /小川町|花小金井|鈴木町|小川西町|美園町|仲町|学園東町|学園西町|上水本町|上水南町|喜平町|回田町|栄町|天神町|御幸町|たかの台|小平市/;
  if (!/[市区]/.test(q) && !looksLikeRoute && looksLikeAddr && KODAIRA.test(paren)) {
    q = '小平市' + q;
  }
  // 場所欄が町名だけのとき（「西東京市緑町/車・自転車約10分」）は、
  // 施設名（見出し）のほうが地図に効く。町名で開くと目的地が出ない。
  // 見出しに施設名が入っていて、場所欄にその施設名が無いなら、見出しを使う。
  //   E10「西武園ゆうえんちプール」 場所欄→「西武園駅」  … 駅ではなくプールを開きたい
  //   E9 「西東京いこいの森公園 噴水広場」 場所欄→「西東京市緑町」 … 町名では出ない
  const inName = name && String(name).match(FACILITY);
  if (inName && !new RegExp(inName[0]).test(q)) {
    const fq = facilityQuery(name);
    if (fq) return fq;
  }
  return q;
}

// 施設名らしい語。地図の検索語を選ぶときの目印。
const FACILITY = /公園|公民館|図書館|美術館|科学館|博物館|動物園|プール|センター|ホール|アリーナ|神社|寺|モール|ランド|ゆうえんち|会館|農園|アスタ|駐屯地|基地/;

// 見出しから地図の検索語を作る（「西東京いこいの森公園 噴水広場」→「西東京いこいの森公園」）
function facilityQuery(name) {
  // 見出し自体が施設名でなく、括弧の中が施設名のことがある
  //（「アスタキッズスタンプカード(田無アスタ)」→ 検索すべきは「田無アスタ」）
  const paren = (String(name || '').match(/[（(]([^）)]+)[）)]/) || [])[1] || '';
  const bare = String(name || '').replace(/[（(][^）)]*[）)]/g, '').replace(/〔[^〕]*〕/g, '').trim();
  if (paren && FACILITY.test(paren) && !FACILITY.test(bare)) return paren.split(/[・、,]/)[0].trim();
  return String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/〔[^〕]*〕/g, '')
    .split(/[・、,]/)[0]
    .replace(/\s*(?:噴水広場|センターコート|ギャラリー|視聴覚室|中ホール|大ホール|展示ギャラリー)\s*$/, '')
    .trim();
}


// ---- 読者に見せる文から、台帳の内部メモを落とす ------------------------------
// 台帳の「子連れ」「内容」欄には、運営用の記号やメモが混ざっている。
//   「◎◎ E7参照。」「✕に近い△」「無料版の『知らないと損』枠に使える」
// これがそのまま公開ページに出ていた（.ics の説明欄にも入って読者のカレンダーに残る）。
// 記号は読者向けの言い方に寄せ、運営メモは削る。
const STRIP = [
  [/E\d+\s*参照。?\s*/g, ''],                        // 「E7参照。」
  [/[、。]?\s*E\d+と同日[^。]*。?/g, ''],              // 「E22と同日なのでどちらか選択」
  [/[（(]\s*E\d+[^）)]*[）)]/g, ''],                   // 「(E12参照)」
  [/◎◎/g, '◎'],                          // 内部の強調（読者には◎で十分）
  [/✕に近い△/g, '△'],
  [/[✕x]\s*に近い/g, ''],
  [/[✕x]\s*[~〜]\s*(?=[◎○△])/g, ''],   // 「✕〜△」→「△」（内部の幅つき評価）
  [/(?<![\w])[✕x](?=\s*[^\S\r\n]*[◎○△])/g, ''],
  [/[，、]?\s*(?:無料版|有料版)の?「[^」]*」枠に(?:使える|できる)。?/g, ''],
  // ★「常設なので…再利用可」を先に丸ごと落とす。あとに回すと「常設なので」だけが残る
  [/。?\s*(?:常設|通年)なので[^。]*(?:再利用|使える)[^。]*。?/g, '。'],
  [/「[^」]*」ネタとして再利用可。?/g, ''],
  [/\s*[（(]\d{4}-\d{2}\s*訂正[）)]/g, ''],       // 運営の校正メモ
  [/\s*[（(]\d{4}-\d{2}-\d{2}\s*(?:訂正|検証|確認)[^）)]*[）)]/g, ''],
];
// 落としきれなかったときに気づくための番兵。読者向けの文にこれが残っていたら公開しない。
// 「損」は方針で禁じている煽り表現。台帳IDと内部記号も読者には意味がない。
const FORBIDDEN = /損|\bE\d{1,3}\b|◎◎/;   // 台帳IDが1つでも残っていたら公開しない
// 見出し自体が台帳の内部ラベルになっているもの（イベントではなく「枠」）。
// 中身は箇条書きで書かれていて `内容:` 欄が無いため、公開すると空カードになる。
const INTERNAL_LABEL = /「?(?:知っていると得|知らないと損)」?枠|^枠[:：]/;

function readerText(s) {
  if (!s) return '';
  let out = String(s);
  for (const [re, to] of STRIP) out = out.replace(re, to);
  return out.replace(/\s{2,}/g, ' ').trim();
}

// 子連れ欄から、先頭に並ぶ年齢の記号（👶○ 🧒◎ 🎒◎ や 裸の ◎/△〜○）を落として本文だけにする。
// 記号は ages 側で出すので、本文にも残ると1枚のカードに年齢目安が2回出る。
function kidsBody(s) {
  if (!s) return '';
  // ★順番が大事。先に readerText で「✕に近い△」→「△」に寄せてから記号を落とす。
  //   逆にすると先頭の ✕ だけが消えて「に近い△ 観客100万人規模…」という
  //   壊れた日本語が残り、読者のカレンダーの説明欄にまで入る。
  // 記号のあとに括弧の注記が付くことがある（「🧒○(親の補助が要る)」）。
  // 記号だけ落とすと括弧が孤立して「(親の補助が要る) 平日開催で…」になる。
  // 注記は本文の頭に言い直して残す。
  var notes = [];
  var out = readerText(String(s));
  out = out.replace(/(?:\s*(?:👶|🧒|🎒)?\s*(?:[◎○△✕x](?:\s*[〜~]\s*[◎○△✕x])?|✕に近い△)\s*[（(]([^）)]*)[）)])/gu,
    function (_m, note) { if (note) notes.push(note.trim()); return ' '; });
  out = out
    .replace(/^(?:\s*(?:👶|🧒|🎒)\s*[◎○△✕x]\s*)+/u, '')
    .replace(/^\s*✕に近い△\s*/u, '')
    .replace(/^\s*[◎○△✕x]\s*[〜~]\s*[◎○△✕x]\s*/u, '')
    .replace(/^\s*[◎○△✕x]{1,2}\s*/u, '')
    .replace(/^\s*[（(]([^）)]*)[）)]\s*/u, function (_m, note) { notes.push(note.trim()); return ''; })
    .trim();
  if (notes.length) out = (notes.join('・') + '。' + out).replace(/。。/g, '。');
  return out.trim();
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

    // 台帳が明示的に「載せない」と書いているものは尊重する
    const holdBack = b.lines.some((l) => /通信に載せない|掲載しない|載せないこと/.test(l));
    if (holdBack) {
      unresolved.push({
        id: b.id, name: b.name,
        reason: '台帳に「未確定のまま通信に載せない」と書かれている',
        when: field(b.lines, ['日時']) || '',
      });
      continue;
    }

    // 終了・見送りは載せない
    if (/終了|見送り/.test(status)) {
      unresolved.push({ id: b.id, name: b.name, reason: `ステータス「${status.split(/\s/)[0]}」のため除外`, when });
      continue;
    }

    // 常設・季節もの（プール・水遊び・スタンプカード等）は日付を持たない。
    // カレンダーのマス目には置かず「いつでも行ける定番」として別枠に出す。
    if (isStanding) {
      // 常設ものは「場所」欄が無いことがある。見出しの括弧と「受取」から組む。
      // ★place を先に決めてから地図クエリを作る。見出しから作ると
      //   「アスタキッズスタンプカード」を検索してしまう（商品名で、場所ではない）。
      const standingPlace = field(b.lines, ['場所', '会場']) ||
        [(b.name.match(/[（(]([^）)]+)[）)]/) || [])[1], field(b.lines, ['受取', '受け取り'])]
          .filter(Boolean).join(' / ');
      standing.push({
        id: b.id,
        name: b.name.replace(/^〔常設〕\s*/, ''),
        span: spanField || when || '通年',
        place: standingPlace,
        mapq: mapQuery(standingPlace, b.name),
        summary: readerText(field(b.lines, ['内容'])),   // ★子連れ欄で埋めない（kidsNoteと二重になる）
        kidsNote: kidsBody(field(b.lines, ['子連れ'])),
        ages: parseAges(field(b.lines, ['子連れ'])),
        cost: field(b.lines, ['料金', '費用', '参加費']),
        url: findURL(b.lines),
        confidence,
        source: b.file,
      });
      continue;
    }

    if (!when) {
      // 「行が無い」と「行はあるが書式が合わない」を区別して出す。前は両方まとめて
      // 「行が無い」と言っていたため、E7（日時(2026確定): と書いてあった）の原因を
      // ログから追えなかった。台帳を疑わせる嘘のログは、無いより悪い。
      // ★記号は - だけでなく * + も見る。台帳は人が手で書く Markdown なので
      //   「* 日時:」と書かれた瞬間に、公式確認済みの予定が黙って消えていた。
      const looksLike = b.lines.find((l) => /^\s*[-*+]\s*(?:\*\*)?\s*(日時|日程|会期|期間|開催)/.test(l));
      unresolved.push({
        id: b.id, name: b.name, confidence,
        reason: looksLike
          ? `日時の行はあるが書式が合わない: 「${looksLike.trim().slice(0, 40)}」`
          : '日時・期間の行が無い',
        when: '',
      });
      continue;
    }

    const { dates, span } = extractDates(when);  // span = 長い会期（マス目に置かない）
    if (!dates.length && !span) {
      unresolved.push({ id: b.id, name: b.name, reason: '日時から確定日が取れない', when, confidence });
      continue;
    }

    // 暫定＝「日付そのものが未確定」なもの。
    // ★時刻の未確認で日付を暫定にしてはいけない。
    //   「8/22(土)・23(日)(例年15:00〜21:00、時間要確認)」は日付は公式確定で、
    //   括弧の中は時刻の話。ここを混ぜると、毎日開いている催しの週が
    //   まるごと「予定なし」になる（E39 麻布十番・E60 西東京みんなの展覧会）。
    const tentative = isDateVague(when);
    const place = field(b.lines, ['場所', '会場']);
    let { start, end, uncertain: timeUncertain } = extractTime(when);
    const programs = extractPrograms(when, dates);
    // その日だけのプログラムから拾った時刻を、全日の既定にしてはいけない
    if (programs) {
      const only = Object.values(programs)[0];
      if (only && only.start === start) { start = null; end = null; }
    }

    events.push({
      id: b.id,
      name: b.name,
      dates,
      span,
      when,
      exceptions: extractExceptions(when, dates),
      programs,
      totalDates: dates.length,   // 窓で絞る前の開催日数（「この催しについて」の判定に使う）
      start,
      end,
      allDay: !start,
      timeUncertain: !!timeUncertain,
      place,
      mapq: mapQuery(place, b.name),
      summary: readerText(field(b.lines, ['内容'])),   // ★子連れ欄で埋めない（kidsNoteと二重になる）
      kidsNote: kidsBody(field(b.lines, ['子連れ'])),
      caution: extractCaution(when),
      contact: extractContact(b.lines),
      lastEntry: extractLastEntry(when),
      hours: extractHours(b.lines),
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
    if (INTERNAL_LABEL.test(e.name)) {
      unresolved.push({
        id: e.id, name: e.name,
        reason: '見出しが台帳の内部ラベル（イベントではない枠）なので公開しない',
        when: e.when || '',
      });
      continue;
    }
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

// ---- 同じ催しが当月・翌月の両方の台帳にある場合の重なりを取る -----------------
// 例: 西武園の大火祭りは 7月台帳の E7（7〜9月ぶん）と 8月台帳の E36（8月ぶんの詳報）に
//     両方書かれている。放っておくと 8/29 に同じ花火が2枚並ぶ。
//     日付を持っている側の詳しさで決めるのではなく「その月をより細かく書いている側」を
//     残す（E36 は 8/8〜15 の毎日を持っている）。
{
  const norm = (n) => String(n).replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '');
  const overlaps = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (norm(a.name) !== norm(b.name)) continue;
      const shared = a.dates.filter((d) => b.dates.includes(d));
      if (!shared.length) continue;
      // その月をより多く書いている側に日付を寄せる
      const month = shared[0].slice(0, 7);
      const cntA = a.dates.filter((d) => d.startsWith(month)).length;
      const cntB = b.dates.filter((d) => d.startsWith(month)).length;
      const winner = cntA >= cntB ? a : b;
      const loser = cntA >= cntB ? b : a;
      // ★勝敗は「日付をどちらに寄せるか」だけに使う。欄の中身は空いている側を埋める。
      //   これをしていなかったため、8月の花火（E36側が勝ち）から場所と公式URLが消え、
      //   同じ花火が「9月に押せば場所が入り、8月に押せば入らない」状態になっていた。
      for (const k of ['place', 'mapq', 'url', 'summary', 'kidsNote', 'confidence', 'contact', 'cost', 'target', 'hours', 'lastEntry', 'caution']) {
        if (!winner[k] && loser[k]) winner[k] = loser[k];
      }
      if (!winner.ages && loser.ages) winner.ages = loser.ages;
      if (winner.start == null && loser.start != null) {
        winner.start = loser.start; winner.end = loser.end;
      }
      loser.dates = loser.dates.filter((d) => !shared.includes(d) || !d.startsWith(month));
      loser.totalDates = loser.dates.length;
      overlaps.push(`${a.id}/${b.id} ${month} の ${shared.length}日ぶん → ${winner.id} に寄せた（空いていた欄は相手から補った）`);
    }
  }
  // 日付が全部なくなったものは出さない（同じ催しの重複なので落としても情報は減らない）
  const emptied = events.filter((e) => !e.dates.length && !e.span);
  for (const e of emptied) {
    unresolved.push({ id: e.id, name: e.name, reason: '同じ催しの別記載に日付を寄せたため（重複）', when: e.when || '' });
  }
  if (emptied.length) {
    const ids = new Set(emptied.map((e) => e.id));
    const rest = events.filter((e) => !ids.has(e.id));
    events.length = 0; events.push(...rest);
  }
  if (overlaps.length) {
    console.log('  ⚠ 同じ催しの重なりを整理した:');
    for (const o of overlaps) console.log(`     ${o}`);
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
// ★JST で日付を作る。GitHub Actions のランナーは UTC なので、そのままだと
//   「台帳の更新日」が1日古く出る（公開カレンダーの窓は JST で切っているので食い違う）。
const generated = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const payload = { generated, events, standing, byDate, unresolved };
writeFileSync(OUT, JSON.stringify(payload, null, 1));

// ---- 落ちたものを必ず表示する（黙って0件にしない）--------------------------
const firm = events.filter((e) => !e.tentative).length;
console.log(`wrote ${OUT}`);
console.log(`  確定 ${firm}件 / 暫定 ${events.length - firm}件 / 常設・季節 ${standing.length}件 / 載せられなかったもの ${unresolved.length}件`);
for (const u of unresolved) console.log(`  - ${u.id} ${u.name}: ${u.reason}${u.when ? ` 「${u.when}」` : ''}`);

// ---- 「公式で確認済み」なのに落ちたものは、書式の取りこぼしを疑う ---------------
// 会員ページへの写し漏れは見張っていたが、その1段上（台帳→JSON）の取りこぼしは
// 無検査だった。「日時(2026確定):」という書き方1つで、公式確認済みの E7（9月連休の
// 花火）が丸ごと消え、有料ページが自分の別の節と矛盾していた。二度目は無しにする。
{
  // (1) 書式違いは必ず読み取り側の不具合。台帳に日時が書いてあるのに拾えていない
  //     ＝黙って消える形なので、ビルドを止める。
  const badFormat = unresolved.filter((u) => /書式が合わない/.test(u.reason));
  if (badFormat.length) {
    console.error('🔴 日時の行はあるのに読み取れませんでした（読み取り側の不具合です）:');
    for (const m of badFormat) console.error(`     ${m.id} ${m.name}: ${m.reason}`);
    console.error('   → scripts/build-events-json.mjs の field() を直すこと（台帳は直さない）。');
    process.exit(1);
  }
  // (2) 台帳が「確認済み」と書いているのに日付が取れないものは、止めはしないが目立たせる。
  //     日付が本当に未定のもの（公民館講座など）もここに入るため。
  const watch = unresolved.filter((u) => /確認済/.test(u.confidence || ''));
  if (watch.length) {
    console.log('  ※ 台帳で「確認済み」と書かれているが、日付が取れないので載せていないもの:');
    for (const m of watch) console.log(`     ${m.id} ${m.name}（${m.reason}）`);
    console.log('     日付が決まっているのにここに出ていたら、台帳の書き方を見直すこと。');
  }
}
