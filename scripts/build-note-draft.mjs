#!/usr/bin/env node
/*
 * note に載せる記事の下書きを1本つくる。
 *   node scripts/build-note-draft.mjs [--date YYYY-MM-DD] [--type spot|week|round]
 *
 * 出力: note/YYYY-MM-DD.md（公開されない。docs/homepage/ の外）
 *
 * ★これは「事実を集めた骨組み」を出すところまでをやる。
 *   文章にするのは人（またはClaude）。台帳にある事実だけを並べ、
 *   **書いていないことを足さない**。ここで作り話が混ざると、
 *   日付を裏取りしている通信の値打ちがそのまま消える。
 *
 * 型は曜日で決まる（docs/note-plan.md「2. 記事の型」）:
 *   水          … week  今週のおでかけ（その週の通信をブログ文体に）
 *   火・木・土  … spot  スポット1本記事（検索の本命）
 *   月・金・日  … round まとめ・季節もの
 *
 * 同じ題材を二度出さないよう、note/ にある下書きの `topic:` を見て避ける。
 * 在庫が尽きたら、いちばん古く書いた題材から順に戻る（更新記事として書き直す）。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'note';
const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const today = argOf('--date') || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const [Y, M, D] = today.split('-').map(Number);
const WD = '日月火水木金土'[new Date(Date.UTC(Y, M - 1, D)).getUTCDay()];
const TYPE_BY_WD = { 水: 'week', 火: 'spot', 木: 'spot', 土: 'spot', 月: 'round', 金: 'round', 日: 'round' };
const type = argOf('--type') || TYPE_BY_WD[WD];

const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const LEDGER = JSON.parse(readFileSync('data/events.json', 'utf8'));

// ---- すでに書いた題材 ---------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const written = readdirSync(OUT_DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .sort()
  .map((f) => {
    const m = /^topic:\s*(.+)$/m.exec(readFileSync(`${OUT_DIR}/${f}`, 'utf8'));
    return m ? m[1].trim() : null;
  })
  .filter(Boolean);
const usedAt = new Map(written.map((t, i) => [t, i]));   // 小さいほど古い
/** まだ書いていないものを優先。全部書いていたら、いちばん古いものから */
const pickFresh = (items, key) => {
  const fresh = items.filter((x) => !usedAt.has(key(x)));
  if (fresh.length) return fresh[0];
  return [...items].sort((a, b) => usedAt.get(key(a)) - usedAt.get(key(b)))[0];
};

// ---- 共通の部品 ---------------------------------------------------------------
const FOOTER = `---
「ぼんぼやーじゅ通信」は、東京都小平市・花小金井のまわりで、
子どもと行ける場所とイベントを、毎週水曜の朝にLINEでお届けしている無料の通信です。

▼ 毎週水曜に受け取る（無料）
https://lin.ee/YtcfjnX

▼ おでかけカレンダー・マップ・過去の号
https://bonvoya.nicomaru.tokyo/

日程・料金は変わることがあります。おでかけの前に各公式でご確認ください。`;

const TAGS = ['#小平市', '#花小金井', '#子連れおでかけ', '#東京子育て', '#未就学児'];

const NOTE_TO_WRITER = `<!-- ここから下は「骨組み」です。note に貼る前に文章にしてください。
     ・1,000〜1,800字 / 見出し（##）は3〜4本
     ・書き出しの2〜3行で「誰に向けた記事か」を言う
     ・絵文字は見出しに1つまで。本文は普通の文章で
     ・★ここに無い事実を足さない。台帳にある事実だけで書く
     ・書き終えたらこのコメントごと消す -->`;

const jpDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const [, yy, mm, dd] = m.map(Number);
  return `${mm}月${dd}日(${'日月火水木金土'[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()]})`;
};
const agesLine = (a) => {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return `👶 ${a.baby || '—'} ／ 🧒 ${a.pre || '—'} ／ 🎒 ${a.elem || '—'}`;
};
const fact = (label, v) => (v ? `- **${label}**: ${v}\n` : '');

// 2点間のざっくり距離（km）。近くのスポットを出すためだけなので球面近似で足りる
const distKm = (a, b) => {
  if (!a.lat || !b.lat) return Infinity;
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

// ---- ① スポット1本記事 --------------------------------------------------------
function spotDraft() {
  const s = pickFresh(SPOTS, (x) => `spot:${x.name}`);
  const near = SPOTS.filter((x) => x.name !== s.name)
    .map((x) => ({ x, d: distKm(s, x) }))
    .filter((o) => Number.isFinite(o.d))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);

  return {
    topic: `spot:${s.name}`,
    titles: [
      `${s.name}に、子どもと行ってきた｜${Y}年の行き方と気をつけること`,
      `【${Y}年】${s.name}は子連れでどう？ 行き方・混む時間・持ちもの`,
      `小平・花小金井からの${s.cat.replace(/^[^\wぁ-ゖ゛-ヿ一-龥]+/, '')}｜${s.name}`,
    ],
    body: `## ${s.name}はこんなところ

${s.desc}

${s.fromReader ? `> 読者の方から届いた声:\n> ${s.fromReader}\n` : ''}
## 行き方

${fact('アクセス', s.access)}${fact('地図', s.map)}${fact('公式サイト', s.official)}
## 子連れで行くときに

${fact('年齢の目安', s.ages)}
（ここに、持ちもの・混む時間・雨のとき・トイレやおむつ替えなど、
　**確かめられたことだけ**を書く。分からないことは「公式でご確認ください」に寄せる）

## 近くでもう1か所

${near.map((o) => `- **${o.x.name}**（約${o.d.toFixed(1)}km）… ${o.x.desc}`).join('\n')}
`,
    facts: `- 分類: ${s.cat}\n${fact('アクセス', s.access)}${fact('年齢の目安', s.ages)}${fact('公式', s.official)}${fact('地図', s.map)}${fact('出典', s.source)}`,
  };
}

// ---- ② 今週のおでかけ ---------------------------------------------------------
function weekDraft() {
  const to = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
  const inWeek = LEDGER.events
    .filter((e) => (e.dates || []).some((d) => d >= today && d <= to))
    .map((e) => ({ ...e, next: (e.dates || []).filter((d) => d >= today && d <= to)[0] }))
    .sort((a, b) => a.next.localeCompare(b.next));
  const spans = LEDGER.events.filter(
    (e) => e.span && (!e.span.to || e.span.to >= today) && !inWeek.some((x) => x.id === e.id)
  );
  const deadlines = LEDGER.events
    .filter((e) => e.deadline && e.deadline.date >= today)
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date))
    .slice(0, 5);

  const item = (e) => `### ${e.name}

${fact('いつ', e.when || jpDay(e.next))}${fact('どこ', e.place)}${fact('料金', e.cost)}${fact('年齢の目安', agesLine(e.ages))}${fact('子連れメモ', e.kidsNote)}${fact('注意', e.caution)}${fact('公式', e.url)}
${e.summary || ''}
`;

  return {
    topic: `week:${today}`,
    titles: [
      `${M}月${D}日の週、小平・花小金井の子連れおでかけ｜${Y}年`,
      `今週末どこ行く？ 小平まわりの子連れイベント（${M}/${D}〜）`,
    ],
    body: `## 今週のおすすめ

${inWeek.slice(0, 3).map(item).join('\n')}
## そのほか、今週うごいているもの

${inWeek.slice(3).map((e) => `- ${jpDay(e.next)} ${e.name}${e.place ? `（${e.place.split(/[、(]/)[0]}）` : ''}`).join('\n') || '- （今週はこれだけです）'}

${spans.length ? `## 会期中ずっと見られるもの\n\n${spans.map((e) => `- ${e.name}${e.span.to ? `（${jpDay(e.span.to)}まで）` : ''}${e.place ? ` — ${e.place.split(/[、(]/)[0]}` : ''}`).join('\n')}\n` : ''}
${deadlines.length ? `## 申込の締切が近いもの\n\n${deadlines.map((e) => `- ${jpDay(e.deadline.date)} まで — ${e.name}`).join('\n')}\n` : ''}`,
    facts: `- 今週の確定イベント: ${inWeek.length}件 / 会期もの ${spans.length}件 / 締切 ${deadlines.length}件\n- 台帳の更新日: ${LEDGER.generated}`,
  };
}

// ---- ③ まとめ・季節もの -------------------------------------------------------
function roundDraft() {
  const cats = [...new Set(SPOTS.map((s) => s.cat))];
  const cat = pickFresh(cats, (c) => `round:${c}`);
  const list = SPOTS.filter((s) => s.cat === cat);
  const clean = cat.replace(/^[^ぁ-ゖ゛-ヿ一-龥a-zA-Z0-9]+/, '');

  return {
    topic: `round:${cat}`,
    titles: [
      `【${Y}年】小平・花小金井まわりの「${clean}」${list.length}か所まとめ`,
      `${clean}｜小平から子連れで行けるところ（${Y}年版）`,
    ],
    body: `## この記事でまとめていること

小平市・花小金井から子連れで行ける「${clean}」を${list.length}か所。
（ここに、どういう人に向けたまとめかを2〜3行で書く）

${list
  .map(
    (s) => `## ${s.name}

${s.desc}

${fact('アクセス', s.access)}${fact('年齢の目安', s.ages)}${fact('公式', s.official)}${fact('地図', s.map)}`
  )
  .join('\n')}`,
    facts: `- 分類: ${cat}（${list.length}か所）\n- 台帳の更新日: ${LEDGER.generated}`,
  };
}

// ---- 組み立て -----------------------------------------------------------------
const make = { spot: spotDraft, week: weekDraft, round: roundDraft }[type];
if (!make) {
  console.error(`型が分からない: ${type}（spot / week / round のどれか）`);
  process.exit(1);
}
const d = make();

const out = `${OUT_DIR}/${today}.md`;
if (existsSync(out) && !args.includes('--force')) {
  console.error(`${out} はもうある。上書きするなら --force`);
  process.exit(1);
}

writeFileSync(
  out,
  `date: ${today}（${WD}）
type: ${type}
topic: ${d.topic}

# 題名の候補（1つ選んで、残りは消す）

${d.titles.map((t) => `- ${t}`).join('\n')}

# 台帳から取った事実（ここが正。書き換えない）

${d.facts}

${NOTE_TO_WRITER}

${d.body}

${FOOTER}

${TAGS.join(' ')}
`
);

console.log(`wrote ${out}`);
console.log(`  型: ${type}（${WD}曜）/ 題材: ${d.topic}`);
console.log(`  これまでに書いた題材: ${written.length}件`);
