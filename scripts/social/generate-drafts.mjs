#!/usr/bin/env node
/*
 * SNS投稿ドラフト生成（Phase 0/1・投稿はしない dry-run）
 *
 * 収集: events/ の台帳(直近の当月・翌月) → Gemini で Threads の下書きを2本生成
 *       → social/drafts/YYYY-MM-DD.md に出力（＝承認ゲート）。
 *
 * 🔴 2026-09-21、X と Instagram をやめた（オーナー判断。反応が無く、投稿もしていなかった）。
 *    Threads だけにした:
 *      【Threads・紹介 1/2】【Threads・紹介 2/2】… **毎日**。1本目を短く、2本目を返信で足す
 *      【Threads・問いかけ】… **隔日**。読んだ人が答えたくなる問いで終える1本（別投稿）
 *    🔴 問いかけを毎日出すと「いつも聞いてくる人」になる。隔日にする（2026-09-21・オーナー判断）。
 *
 * 🔴 2026-09-21（2回目の見直し）、**問いかけの相手を変えた。**
 *    それまでは紹介と同じイベントについて聞かせていたが、
 *      (1) 同じ日に同じ対象を2回出すと、宣伝の重ね打ちに見える
 *      (2) **イベントの答えは一度きりで死ぬ。**「10/12は何時が空いてる?」は10/13に使えない
 *    → **問いかけの相手は data/map-spots.json（定番スポット）から選ぶ。台帳からではない。**
 *      **まだ `fromReader`（読者の声）が入っていないスポット**を優先して回す。
 *      答えはそのままそのスポットの `fromReader` になる。**問いかけ＝マップの取材。**
 *    紹介も **1/2 + 2/2（返信）** に分けた。1本目にリンクとタグを入れない
 *    （リンク入りは伸びにくい。Threadsでよく見る「続きは返信」の形）。
 *    問いかけのほうが伸びる、という観測から（返信が付く投稿は表示も伸びる）。
 *    答えは **おでかけマップの材料**にもなる（地元の家庭の持ち寄り）。
 * 投稿は一切しない。GEMINI_API_KEY 未設定でもワークフローは失敗せず、その旨のドラフトを残す。
 *
 * 必要な環境変数:
 *   GEMINI_API_KEY  … Google AI Studio (aistudio.google.com) で発行。GitHub Secretsに登録。
 *   GEMINI_MODEL    … 任意。指定するとそのモデルだけ使う。未指定なら複数モデルを順に試す
 *                     （gemini-1.5-flash → 2.5-flash → 2.0-flash → flash-latest）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD (JST)
// GEMINI_MODEL が指定されればそれだけを、無ければ複数モデルを順に試す（無料枠/可用性の違いを吸収）。
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
const KEY = process.env.GEMINI_API_KEY || '';
// 🔴 2026-09-23、/f から /th に変えた。/f は紙（チラシのQR）の計測コードで、
//    Threadsの投稿が9/2から65日ぶん /f にリンクしていたため、紙とThreadsの流入が混ざっていた。
//    /th は Threads 専用。GoatCounter でパスごとに分けて数えられる。
const HP = 'https://bonvoya.nicomaru.tokyo/th';

// 問いかけは隔日。紀元からの通日の偶奇で決める（月末月初でも2日続かない）。
// ASK_DAY=1 で今日だけ強制的に作らせる（手で確かめたいとき用）。
const EPOCH_DAY = Math.floor(Date.parse(TODAY + 'T00:00:00Z') / 86400000);
const ASK_TODAY = process.env.ASK_DAY === '1' || EPOCH_DAY % 2 === 0;

mkdirSync('social/drafts', { recursive: true });

// --- 収集: 台帳（events/YYYY-MM.md の直近3ファイル）---
function loadLedger() {
  let files = [];
  try { files = readdirSync('events').filter(f => /^\d{4}-\d{2}\.md$/.test(f)).sort(); } catch {}
  return files.slice(-3).map(f => `===== events/${f} =====\n${readFileSync('events/' + f, 'utf8')}`).join('\n\n');
}

// --- 問いかけの相手: data/map-spots.json から1件選ぶ ---
// まだ読者の声(fromReader)が入っていないスポットを優先。直近のドラフトで聞いたものは外す。
// 並びはカテゴリごとに固まっているので、**歩幅7で飛ばして**同じカテゴリが続かないようにする
// （45件と7は互いに素なので、全部を一巡してから戻る）。
function pickSpot(recent) {
  let spots = [];
  try {
    const raw = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
    spots = Array.isArray(raw) ? raw : (raw.spots || []);
  } catch { return null; }
  let pool = spots.filter(s => s && s.name && !s.fromReader);
  if (!pool.length) pool = spots.filter(s => s && s.name);   // 全部埋まったら、ひと回りめに戻る
  const fresh = pool.filter(s => !recent.includes(s.name));  // 最近聞いたものは外す
  if (fresh.length) pool = fresh;
  if (!pool.length) return null;
  return pool[(EPOCH_DAY * 7) % pool.length];
}

// --- 重複除去: 最近のドラフト（直近10日分）を渡して同じ話題を避けさせる ---
function loadRecentDrafts() {
  let files = [];
  try { files = readdirSync('social/drafts').filter(f => /\.md$/.test(f)).sort(); } catch {}
  return files.slice(-10).map(f => readFileSync('social/drafts/' + f, 'utf8')).join('\n');
}

const ASK_SPEC = (spot) => `【Threads・問いかけ】（200字以内・**上の紹介とは別の投稿。別の日に出す**）

🔴 **上の紹介とは、まったく別のことを書く。同じイベントの話は書かない。**
**相手はこのスポット:**

  名前: ${spot.name}
  場所/行き方: ${spot.access || '(記載なし)'}
  どんなところか: ${spot.desc || '(記載なし)'}
  年齢の目安: ${spot.ages || '(記載なし)'}

**告知ではない。ひとりの親が、この場所について迷っていることを声に出している投稿。**

- 🔴 **行ったことにしない。**「うちの子が」「先週行ったら」「楽しかった」など、
  **こちらが体験したように書くのは禁止。実際には行っていないので、嘘になる。**
- ⭕️ **代わりに「迷っていること」から書く。**
  **行ったことがないから迷っている。これは事実なので、書いてよい。**
  「行くか迷っています」「はじめてなので勝手が分かりません」「気になっているけれど踏み切れない」
- 🔴 **問いは1つだけ。**2つ聞くと、答えるのが面倒になって誰も答えない。
- 🔴 **自分の子のことを聞かない。**「うちの子は楽しめますか」は**相手が答えようがない。**
  **場所のことを聞く。**「何時ごろが空いていますか」「何歳くらいから楽しめますか」のように、
  **行ったことがある人なら誰でも答えられる形にする。**
- 聞くのは、**行く前に知りたいのに、公式に書いていないこと**。
  混み具合／ちょうどいい時間帯／ベビーカーで回れるか／駐車場／
  小さい子がどのくらい楽しめるか／近くでごはんを食べるなら／持っていくといいもの
- 🔴 **日付を書かない。**この場所はいつでも行ける。「今週末」と書くと一度きりの話になる。
- **4〜7行。空行を入れて読みやすく。絵文字は1〜2個まで。最後の1行を問いにする。**
- 🔴 **リンクもハッシュタグも付けない。**付けると宣伝に見えて、返事が来なくなる。

**この3つくらいの温度で書く（形をまねる。中身は上のスポットから）:**

--- 例1 ---
小平の児童館、上の子のときは行きそびれたまま来てしまいました。

下の子とそろそろ行ってみようかと思うのですが、
はじめてだと勝手が分からなくて。

何時ごろ行くと、ちょうどいいですか🤔
--- 例2 ---
雨の日の逃げ場をひとつ増やしたくて、気になっている場所があります。

ただ、2歳と5歳を同時に連れて行って、
どちらも間がもつのかが分からない。

下の子がいても大丈夫でしたか？
--- 例3 ---
0歳から入れるプラネタリウムの回があるそうで。

「泣いてもOK」と書いてあっても、
いざ連れて行くとなると、やっぱり迷います。

赤ちゃん連れで行かれた方、どうでしたか？
--- ここまで ---

⚠️ **上の例の文章をそのまま使わない。**温度と組み立て（状況→迷い→ひとつの問い）だけまねる。
`;

const PROMPT = (ledger, recent, spot) => `あなたは、花小金井まわり（東京・小平/西東京）の子育て家庭向け無料通信「ぼんぼやーじゅ通信」のSNS担当です。
下の【台帳】から、今日以降（本日=${TODAY} 以降）に開催・実施される、未就学児〜小学生の家庭向けのイベントやスポットを1つだけ選び、SNS投稿のドラフトを作ってください。

# 選び方（重要・近場優先）
- **花小金井から近くて行きやすいものを最優先**に選ぶ。目安エリア: 小平・西東京・東久留米・東村山・清瀬・小金井や、西武新宿線ぞい、電車でおおむね30分以内。
- 台帳の「場所」欄に花小金井からの所要時間が書いてあれば参考にし、**近いほど優先**。「★地元」の印があるものは最有力候補。
- 都心や遠方（例: 神楽坂・浅草・立川など、片道40分以上）は基本は選ばない。**よほど魅力的で行きやすい時だけ、たまに**混ぜる程度。
- 距離が同程度なら、未就学児も楽しめる／無料・低予算／屋内や日陰など、子連れで行きやすいものを優先。

# トーン（厳守）
- やさしく淡々と。売り込まない。「急いで」「損」「今だけ」等の煽りは使わない。
- 事実ベース（イベント名・日付・場所）。日付は本日以降のものだけ（過去日は選ばない）。台帳に日付の裏取りメモがあれば尊重。
- 「こんなの見つけたよ🎈」くらいの、地元のおすそわけの空気。

# 出力フォーマット（${ASK_TODAY ? 'この3ブロックだけを' : 'この2ブロックだけを'}、この見出しで出力）
${ASK_TODAY && spot ? `🔴 **【紹介】には「${spot.name}」を選ばないこと。**
そこは下の【問いかけ】で扱う。**紹介と問いかけが同じ場所になると、同じ話を2回する投稿になる。**
【紹介】は、必ず**別の**イベント/スポットを【台帳】から選ぶ。

` : ''}【Threads・紹介 1/2】（180字以内・**これを最初に投稿する**）
- **短く。リンクもハッシュタグも書かない**（リンクを入れると伸びにくい）。
- 「こんなのがあるらしい」＋**イベント名・日付・場所**まで。
  **ここまでで、タップしない人にも用が足りるようにする。**

🔴 **いちばん大事: 最後の1行を「、」で終える。文を途中で切る。**

- ❌ **「〜ですよ。」「〜です。」で終わらない。**
  **言い切ると、続きを読む理由が無くなる**（返信を開いてもらえない）。
- ⭕️ **話の途中で切る。**次に何を言うかが見えているのに、まだ言っていない状態にする。
  「ちなみに、」「いちばん助かるのは、」「ひとつだけ気をつけたいのが、」
  「小さい子がいると迷うところですが、これが、」
- 🔴 **煽らない。**「衝撃」「知らないと損」「絶対」は使わない。
  **ただの話の切れ目**であって、もったいぶりではない。
- ⚠️ **「1/2」「続く」と自分で書かない。**Threadsが自動で付ける。

**この形で切る:**

--- 例1 ---
花小金井からすぐの多摩六都科学館で、未就学の子と入れるプラネタリウムが始まっています🎈
12/27(日)まで、約35分の回です。

ちなみに、うれしかったのは料金のところで、
--- 例2 ---
10/12(月祝)、小平駅前でまるっと一日、音楽のお祭りがあるそうです。
10:00〜19:00、全ステージ観覧無料。

小さい子がいると「行っても間がもつかな」となりますが、これが、
--- 例3 ---
小平中央公園で10/25(日)、ハロウィンの子ども祭りがあります。
10:00〜15:00、入場無料。

いちばん「おっ」と思ったのは、
--- ここまで ---

⚠️ 例の文章をそのまま使わない。**切り方**だけまねる。

【Threads・紹介 2/2】（400字以内・**1/2 への返信として投稿する**）
- 🔴 **1/2 の最後の「、」から、そのまま文を続ける。**
  1/2が「ちなみに、うれしかったのは料金のところで、」なら、
  2/2は「4歳未満は無料でした。」のように**受けて始める。**
  **途中で切った文を、放り出さない。**
- そのうえで **日時・場所・費用**を行ごとに並べ、**子連れ視点の一言**を足す。
- 公式リンクが台帳にあれば1つ添える。
- 末尾に「くわしくは → ${HP}」と、ハッシュタグを4〜6個（下記の作り方に従う）。

${ASK_TODAY && spot ? ASK_SPEC(spot) : ''}# ハッシュタグの作り方（重要・**【Threads・紹介 2/2】にだけ付ける**）
毎回おなじタグにせず、**その回の内容（トピック）からも必ず作る**。次の3種類を混ぜる:
1. **場所**: 開催地・エリア（例 #小平 #花小金井 #西東京 #東村山 #西武新宿線）
2. **イベント名・施設名**: その回の主役をそのままタグに（例 #西武園ゆうえんち #多摩六都科学館 #小平駐屯地 #小金井阿波おどり）。スペースや記号は除いて1語にする。
3. **ジャンル・季節**: 内容に合うもの（例 #花火 #夏祭り #盆踊り #水あそび #じゃぶじゃぶ池 #プラネタリウム #雨の日 #室内あそび #工場見学 #動物園 #紅葉 #イルミネーション）
- 共通の #子連れおでかけ は1つ入れてよいが、**残りは必ずその回の内容に合わせて変える**。
- 実在しない名称や、内容と関係ないタグは付けない。

※重要: 出力は上記${ASK_TODAY ? '【Threads・紹介 1/2】【Threads・紹介 2/2】【Threads・問いかけ】の3ブロック' : '【Threads・紹介 1/2】【Threads・紹介 2/2】の2ブロック'}のみ。前置き・後書き・文字数の計算・推敲メモ・思考過程・囲みの引用符（「」で全体を囲む等）は一切書かない。本文だけをそのまま出す。

# 重複回避
次の【最近の投稿】と同じイベントは選ばない：
${recent || '(なし)'}

# もし該当が無い場合
「本日以降の適当なイベントが台帳に見当たりませんでした」とだけ書く。

【台帳】
${ledger}
`;

// 2ブロック両方そろって初めて「使える草案」。思考モデルは思考でトークンを消費し、
// 途中で切れる日がある（2026-08-02 に発生）ので、必ず検査して足りなければ作り直す。
const SPOT = ASK_TODAY ? pickSpot(loadRecentDrafts()) : null;
const BLOCKS = ['【Threads・紹介 1/2】', '【Threads・紹介 2/2】']
  .concat(ASK_TODAY && SPOT ? ['【Threads・問いかけ】'] : []);
const isComplete = (t) => BLOCKS.every(b => t.includes(b));

// 紹介と問いかけが同じ場所になっていないか。なっていたら作り直す
// （2026-09-22、問いかけ用に渡したスポット名を紹介にも使ってしまう回があった）。
function sameSubject(t) {
  if (!ASK_TODAY || !SPOT) return false;
  const i = t.indexOf('【Threads・問いかけ】');
  const intro = i < 0 ? t : t.slice(0, i);
  // 「小川西町中宿地域センター 出張こども広場」のような長い名前は、
  // 前半（空白/記号までの塊）が紹介に出ていれば同じ話とみなす
  const key = SPOT.name.split(/[ 　（(]/)[0];
  return key.length >= 4 && intro.includes(key);
}

async function callGemini(model, prompt, useThinking, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const generationConfig = { temperature: 0.7, maxOutputTokens: maxTokens };
  if (useThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // 2.5系: 思考OFFで無駄トークン削減
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
  });
  const raw = await res.text();
  if (!res.ok) { const err = new Error(`${res.status} ${raw.slice(0, 200)}`); err.status = res.status; throw err; }
  const cand = JSON.parse(raw)?.candidates?.[0];
  const text = cand?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('空応答');
  return { text, finishReason: cand?.finishReason || '' };
}

async function gen() {
  const prompt = PROMPT(loadLedger(), loadRecentDrafts(), SPOT);
  const errs = [];
  let partial = null; // 途中で切れた草案（最後の保険。何も無いよりはマシ）
  for (const model of MODELS) {
    // 8192 で1回、足りなければ 16384 でもう1回（思考ぶんの余裕をとる）
    for (const maxTokens of [8192, 16384]) {
      // まず thinkingBudget:0 で試し、400（thinkingConfig非対応など）なら同じモデルを思考指定なしで再試行
      for (const useThinking of [true, false]) {
        let r;
        try {
          r = await callGemini(model, prompt, useThinking, maxTokens);
        } catch (e) {
          errs.push(`${model}/${maxTokens}${useThinking ? '' : '(思考なし)'}: ${e.message}`);
          if (e.status !== 400) break; // 404/429など: 思考なし再試行は無駄→次へ
          continue;
        }
        if (isComplete(r.text) && !sameSubject(r.text)) return { text: r.text, model };
        const miss = BLOCKS.filter(b => !r.text.includes(b)).join('');
        const why = miss ? `不完全(${miss}が欠落, finishReason=${r.finishReason})`
                         : `紹介と問いかけが同じ場所(${SPOT && SPOT.name})`;
        errs.push(`${model}/${maxTokens}${useThinking ? '' : '(思考なし)'}: ${why}`);
        if (!partial || r.text.length > partial.text.length) partial = { text: r.text, model };
        break; // 同じ条件で思考ありなしを変えても改善しないので次のトークン量へ
      }
    }
  }
  if (partial) { partial.incomplete = true; return partial; }
  throw new Error('全モデル失敗:\n' + errs.join('\n'));
}

const out = `social/drafts/${TODAY}.md`;
let body;
if (!KEY) {
  body = `# ${TODAY} SNSドラフト（未生成）\n\n` +
    `GEMINI_API_KEY が未設定のため生成をスキップしました。\n` +
    `GitHub の Settings → Secrets and variables → Actions に GEMINI_API_KEY を登録すると、翌日から自動生成されます。\n`;
  console.log('GEMINI_API_KEY 未設定: プレースホルダを出力');
} else {
  try {
    const { text, model, incomplete } = await gen();
    const dup = sameSubject(text);
    const head = (incomplete || dup)
      ? `# ${TODAY} SNSドラフト（⚠️投稿前に直すところがあります）`
      : `# ${TODAY} SNSドラフト（承認待ち・まだ投稿していません）`;
    body = `${head}\n\n` +
      (incomplete ? `> ⚠️ 生成が途中で終わり、ブロックが足りていません。欠けている分は手で書き足すか、Actions から「SNS drafts」を再実行してください。\n\n` : '') +
      (dup ? `> 🔴 **紹介と問いかけが同じ場所（${SPOT && SPOT.name}）になっています。**同じ話を2回する投稿になるので、どちらかを別のものに差し替えるか、Actions から「SNS drafts」を再実行してください。\n\n` : '') +
      `${text}\n\n---\n` +
      `※自動生成（model: ${model}）。投稿前に日付・事実・トーンを目視確認してください。\n` +
      `※【紹介 1/2】を投稿し、その**返信として【紹介 2/2】**をぶら下げる。1/2にリンクを入れない。\n` +
      (ASK_TODAY && SPOT
        ? `※【問いかけ】は「${SPOT.name}」について。**紹介とは別の対象**なので、同じ日でも重ならない。\n` +
          `※【問いかけ】にリンクやハッシュタグを足さない（宣伝に見えると返事が来ない）。\n` +
          `※返事が来たら「${SPOT.name}」の fromReader に入れる（手順は scripts/social/README.md）。\n`
        : `※今日は【紹介】だけの日です（問いかけは隔日）。\n`) +
      `※飛び先は ${HP} に統一（【紹介】のみ）。\n`;
    console.log(incomplete ? '生成(不完全):' : '生成OK:', out, 'model:', model);
  } catch (e) {
    body = `# ${TODAY} SNSドラフト（生成エラー）\n\n\`\`\`\n${e.message}\n\`\`\`\n\n` +
      `モデル名が原因なら Actions Variables に GEMINI_MODEL を設定してください（例: gemini-1.5-flash）。\n`;
    console.error('生成エラー:', e.message);
  }
}
writeFileSync(out, body);
// 手動運用用: いつも同じURLで最新の草案を見られるように latest.md も更新する
writeFileSync('social/drafts/latest.md', body);
console.log('wrote', out, '(+ social/drafts/latest.md)');
