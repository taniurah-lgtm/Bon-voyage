#!/usr/bin/env node
/*
 * ChatGPT・Gemini に読ませるための「おでかけ一覧」を作る。
 *   node scripts/build-ai-pack.mjs
 *
 * 出力:
 *   docs/homepage/ai/odekake.txt   … AIに渡す本体（プレーンテキスト）
 *   docs/homepage/ai/index.html    … コピーボタンと質問例のページ
 *
 * ★なぜLINEに添付ではなくリンクなのか
 *   LINE公式アカウントの配信はファイルを添付できない（Messaging API の
 *   メッセージ種別にファイル型がなく、管理画面の一斉配信にも添付欄がない）。
 *   なので配信は「リンク1本」にして、ページ側でコピー/保存できるようにする。
 *   ついでに GoatCounter で /ai/ の閲覧数が測れる＝使われたか分かる。
 *
 * ★中身の作り方の約束
 *   - 台帳(data/events.json)と地図(data/map-spots.json)から機械的に作る。
 *     手で書き足さない。台帳が正で、ここはその写し。
 *   - **終わったイベントは入れない。**古い日付が混ざるとAIが平気で勧める。
 *   - 各件に「確度」と「出典URL」を必ず付ける。AIが盛ったときに読者が
 *     一次情報へ戻れるようにするため。これが無いと、AIの間違いが
 *     こちらの間違いとして伝わる。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'docs/homepage/ai';
mkdirSync(OUT_DIR, { recursive: true });

const events = JSON.parse(readFileSync('data/events.json', 'utf8'));
const spotsRaw = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const spots = Array.isArray(spotsRaw) ? spotsRaw : (spotsRaw.spots || []);

// ★このコンテナはUTCで動く。日本時間で数えないと、日付も曜日も1日ずれる。
//   （2026-09-23 は水曜なのに「火」と出て、読者が土日を取り違える）
const JST = (d) => new Date(d.getTime() + 9 * 3600 * 1000);
const TODAY = JST(new Date()).toISOString().slice(0, 10);

/** そのイベントが「まだ先」かどうか。判断できないものは残す（落とすより安全） */
function lastDate(e) {
  const ds = [...(e.dates || [])];
  if (e.span?.to) ds.push(e.span.to);
  if (e.span?.from) ds.push(e.span.from);
  if (!ds.length) return null;             // 通年・随時
  return ds.sort().at(-1);
}
function firstDate(e) {
  const ds = [...(e.dates || [])];
  if (e.span?.from) ds.push(e.span.from);
  if (e.span?.to) ds.push(e.span.to);
  return ds.sort()[0] || '9999-99-99';     // 日付なしは最後に回す
}

const upcoming = (events.events || [])
  .filter((e) => !['終了', '見送り'].includes(e.status))
  .filter((e) => { const d = lastDate(e); return d === null || d >= TODAY; })
  .sort((a, b) => firstDate(a).localeCompare(firstDate(b)));

const ageLine = (a) => {
  if (!a) return '';
  if (a.overall) return `全体 ${a.overall}`;
  const p = [];
  if (a.baby) p.push(`0〜2歳 ${a.baby}`);
  if (a.pre) p.push(`3〜6歳 ${a.pre}`);
  if (a.elem) p.push(`小学生 ${a.elem}`);
  return p.join(' / ');
};

const line = (label, v) => (v && String(v).trim() ? `  ${label}: ${String(v).replace(/\s*\n\s*/g, ' ').trim()}\n` : '');

const WD = ['日', '月', '火', '水', '木', '金', '土'];
// getDay() はローカル時刻（＝UTC）で判定してしまうので、UTCで作ってUTCで読む
const withWd = (d) => `${d}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;

function eventBlock(e) {
  let s = `[${e.id}] ${e.name}\n`;
  s += line('いつ', e.when || (e.dates || []).join('・'));
  // ★「いつ」は台帳の原文なので、終わった日付も並んだままのことがある。
  //   （例: E7 は 7/19・8/1… と 9/19 が同じ行に載っている）
  //   AIはそこを拾って過去の日を勧めてくるので、残っている日だけを別行で渡す。
  const rest = (e.dates || []).filter((d) => d >= TODAY);
  if (rest.length) s += line('これから残っている日', rest.map(withWd).join('・'));
  else if (e.span?.to && e.span.to >= TODAY) {
    s += line('これから残っている期間', `${e.span.from ? withWd(e.span.from) + ' 〜 ' : '〜'}${withWd(e.span.to)}`);
  }
  s += line('どこ', e.place);
  s += line('時間', e.hours);
  s += line('料金', e.cost);
  s += line('対象', e.target);
  s += line('年齢の目安', ageLine(e.ages));
  s += line('子連れメモ', e.kidsNote);
  s += line('注意', e.caution);
  s += line('申込の締切', e.deadline);
  s += line('雨天', (e.rainDates || []).join('・'));
  s += line('確度', e.confidence + (e.tentative ? '（未確定・要確認）' : ''));
  s += line('出典', e.url);
  return s;
}

function spotBlock(sp) {
  let s = `● ${sp.name}\n`;
  s += line('分類', sp.cat);
  s += line('メモ', sp.desc);
  s += line('アクセス・料金', sp.access);
  s += line('年齢の目安', sp.ages);
  s += line('公式', sp.official);
  return s;
}

const HEAD = `ぼんぼやーじゅ通信 おでかけ一覧（ChatGPT・Gemini などにそのまま読ませるためのファイル）

このファイルの日付は ${TODAY} 時点のものです。
小平市の未就学児・小学生のいる家庭向けに、花小金井からだいたい30分で行ける範囲の
イベントとおでかけ先をまとめています。市境はまたぎます（西東京・東久留米・小金井・東村山）。

発行: ぼんぼやーじゅ通信の会（小平市・花小金井）/ 小平市民活動支援センター あすぴあ 登録団体（第254号）
最新版: https://bonvoya.nicomaru.tokyo/ai/

─────────────────────────────────────────────
■ AIへのお願い（この下の一覧だけを根拠にしてください）

1. **このファイルに書いていないイベントを作らないでください。** 見つからないときは
   「この一覧にはありません」と答えてください。
2. 日付・料金・時間は、このファイルの記載をそのまま使ってください。推測で補わないでください。
3. 「確度」に「未確認」「要確認」とある項目は、答えるときも必ずその旨を添えてください。
4. 答えの最後に、そのイベントの「出典」のURLを必ず付けてください。
5. 相手は小さい子どもを連れた保護者です。次のことが分からないときは、先に質問してください。
   - 子どもの年齢（何歳と何歳か）
   - 行く日と、だいたいの時間帯
   - 車があるか、電車・ベビーカーか
   - 雨でも行きたいか、屋内がいいか
   - 予算（無料がいいか、有料でもよいか）
6. 「年齢の目安」は ◎ よく向く / ○ 向く / △ 工夫がいる、の3段階です。
7. 最後に「実際に行く前に、必ず公式サイトで最新の情報を確かめてください」と添えてください。

─────────────────────────────────────────────
■ これから行けるイベント（${upcoming.length}件・${TODAY} 以降）
`;

const MID = `
─────────────────────────────────────────────
■ いつでも行けるおでかけ先（${spots.length}件）
   地元の家庭が「行ってよかった」と持ち寄っている場所です。
   イベントが無い週末や、雨のときの行き先としてどうぞ。
`;

const TAIL = `
─────────────────────────────────────────────
■ 出典について

イベントは、市や施設の公式ページを一件ずつ見て日付を確かめています。
まとめサイトからの転載はしていません。「おでかけ先」は地元の家庭の持ち寄りです。

ただし、このファイルを読んだAIの答えが正しいことまでは保証できません。
**行く前に、必ず「出典」のURLで最新の情報を確かめてください。**
中止・変更・雨天時の扱いは、直前に変わることがあります。

ぼんぼやーじゅ通信（無料・毎週水曜） https://bonvoya.nicomaru.tokyo/
`;

const txt = HEAD + '\n' + upcoming.map(eventBlock).join('\n') + MID + '\n'
  + spots.map(spotBlock).join('\n') + TAIL;

writeFileSync(`${OUT_DIR}/odekake.txt`, txt);

const kb = (Buffer.byteLength(txt, 'utf8') / 1024).toFixed(0);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PROMPTS = [
  '添付の一覧から、今週の土曜に5歳と2歳を連れて行けるところを3つ選んでください。車はありません。雨だったとき用の屋内も1つお願いします。',
  '添付の一覧で、申込の締切が近いものを、締切の早い順に教えてください。子どもは3歳と6歳です。',
  '添付の一覧から、来月の連休に家族4人（大人2・小学生1・2歳1）で行くなら、と思うプランを1日ぶん組んでください。移動は電車です。',
];

const html = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>AIに聞くためのおでかけ一覧｜ぼんぼやーじゅ通信</title>
<meta name="description" content="ChatGPTやGeminiに読ませるための、小平まわりのおでかけ一覧。イベント${upcoming.length}件とおでかけ先${spots.length}件を、出典つきでまとめたテキストです。無料。">
<style>
:root{
  --ground:#FBFAF5; --surface:#FFFFFF; --surface-2:#F5F2EA;
  --ink:#34434C; --ink-soft:#63727B; --sky:#4FA3C4; --sky-deep:#2C7C9E;
  --sky-wash:#E9F4F7; --marigold-wash:#FBEEDA; --marigold-ink:#8A5A12;
}
*{box-sizing:border-box;}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;
  line-height:1.8;-webkit-text-size-adjust:100%;}
.wrap{max-width:720px;margin:0 auto;padding:28px 20px 64px;}
a{color:var(--sky-deep);}
h1{font-size:1.5rem;line-height:1.45;margin:6px 0 10px;}
h2{font-size:1.08rem;margin:34px 0 10px;}
.lede{color:var(--ink-soft);margin:0 0 22px;}
.back{font-size:.9rem;}
.card{background:var(--surface);border-radius:14px;padding:18px 18px 20px;
  box-shadow:0 1px 3px rgba(52,67,76,.08);margin:0 0 18px;}
.btn{display:inline-block;border:0;cursor:pointer;font:inherit;font-weight:800;
  background:var(--sky-deep);color:#fff;border-radius:999px;padding:13px 26px;
  text-decoration:none;box-shadow:0 6px 16px rgba(44,124,158,.24);}
.btn:active{transform:translateY(1px);}
.btn.sub{background:var(--surface-2);color:var(--ink);box-shadow:none;font-weight:700;}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:4px;}
ol.steps{padding-left:1.3em;margin:0;}
ol.steps li{margin:0 0 8px;}
.q{background:var(--surface-2);border-radius:12px;padding:12px 14px;margin:0 0 10px;}
.q p{margin:0 0 8px;font-size:.95rem;}
.copy-s{border:0;cursor:pointer;font:inherit;font-size:.84rem;font-weight:700;
  background:var(--surface);color:var(--sky-deep);border-radius:999px;padding:6px 14px;}
.note{background:var(--marigold-wash);color:var(--marigold-ink);border-radius:12px;
  padding:14px 16px;font-size:.94rem;}
.tiny{font-size:.84rem;color:var(--ink-soft);}
.ok{color:#2F6B34;font-weight:800;font-size:.9rem;}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#171E22; --surface:#1F282D; --surface-2:#263137;
    --ink:#E7EDF0; --ink-soft:#A9B6BD; --sky-deep:#8FCFE6;
    --marigold-wash:#3A2E18; --marigold-ink:#F0C88A;
  }
}
</style>
</head><body>
<div class="wrap">
  <p class="back"><a href="/">← ぼんぼやーじゅ通信</a></p>
  <h1>AIに聞くための<br>おでかけ一覧</h1>
  <p class="lede">ChatGPT や Gemini をお使いの方へ。小平まわりの<b>イベント${upcoming.length}件</b>と<b>おでかけ先${spots.length}件</b>を、
  出典つきで1つのテキストにまとめました。これを貼りつけて「今週どこ行こう？」と聞いてみてください。無料です。</p>

  <div class="card">
    <h2 style="margin-top:0">使い方</h2>
    <ol class="steps">
      <li>下の<b>「一覧をコピー」</b>を押す</li>
      <li>ChatGPT や Gemini を開いて<b>貼りつける</b></li>
      <li>そのまま<b>「今週の土曜、5歳と2歳を連れてどこがいい？」</b>のように聞く</li>
    </ol>
    <div class="row" style="margin-top:16px">
      <button class="btn" id="copy">一覧をコピー</button>
      <a class="btn sub" href="/ai/odekake.txt" download="bonvoyage-odekake.txt">ファイルで保存</a>
      <span class="ok" id="done" hidden>コピーしました</span>
    </div>
    <p class="tiny" style="margin:12px 0 0">テキスト約${kb}KB／${TODAY} 時点。ファイルで保存すると、AIアプリに「添付」で渡せます。</p>
  </div>

  <h2>そのまま使える聞き方</h2>
${PROMPTS.map((p, i) => `  <div class="q">
    <p>${esc(p)}</p>
    <button class="copy-s" data-p="${i}">この質問をコピー</button>
  </div>`).join('\n')}

  <h2>ひとつだけ、お願いです</h2>
  <div class="note">
    このファイルの日付や料金は、市や施設の公式ページで一件ずつ確かめています。
    ただ、<b>それを読んだAIの答えが正しいことまでは保証できません。</b>
    AIは、それらしい答えを作ってしまうことがあります。
    <b>行く前に、必ず公式サイトで確かめてください。</b>一覧には出典のURLを付けてあります。
  </div>

  <p class="tiny" style="margin-top:28px">
    毎週水曜の朝に、おでかけ情報をLINEでお届けしています（無料）。<br>
    発行：ぼんぼやーじゅ通信の会（小平市・花小金井）／小平市民活動支援センター あすぴあ 登録団体（第254号）<br>
    <a href="/">ホームページ</a>　<a href="/calendar.html">おでかけカレンダー</a>　<a href="/map.html">おでかけマップ</a>
  </p>
</div>

<script src="/assets/analytics.js" defer></script>
<script>
(function () {
  var PROMPTS = ${JSON.stringify(PROMPTS)};
  var done = document.getElementById('done');

  // クリップボードは https と「ユーザー操作の直後」でしか使えない。
  // 使えない環境（古いブラウザ・アプリ内ブラウザ）では、選択させる形に落とす。
  function put(text, btn) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { flash(btn); });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); flash(btn); }
    catch (e) { alert('コピーできませんでした。「ファイルで保存」からお使いください。'); }
    document.body.removeChild(ta);
    return Promise.resolve();
  }
  function flash(btn) {
    if (done) { done.hidden = false; setTimeout(function () { done.hidden = true; }, 2200); }
    if (btn) { var t = btn.textContent; btn.textContent = 'コピーしました';
      setTimeout(function () { btn.textContent = t; }, 2200); }
  }

  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    btn.textContent = '読み込み中…';
    fetch('/ai/odekake.txt', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { return put(t, btn); })
      .catch(function () {
        btn.textContent = '一覧をコピー';
        alert('読み込めませんでした。「ファイルで保存」からお使いください。');
      });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.copy-s'), function (b) {
    b.addEventListener('click', function () { put(PROMPTS[+b.dataset.p], b); });
  });
})();
</script>
</body></html>
`;

writeFileSync(`${OUT_DIR}/index.html`, html);

console.log(`wrote ${OUT_DIR}/odekake.txt  （イベント${upcoming.length}件 / おでかけ先${spots.length}件 / 約${kb}KB）`);
console.log(`wrote ${OUT_DIR}/index.html`);
if (upcoming.length === 0) {
  console.error('🔴 これから行けるイベントが0件。台帳が古いか、日付の判定が壊れている。');
  process.exit(1);
}
