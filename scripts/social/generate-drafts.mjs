#!/usr/bin/env node
/*
 * SNS投稿ドラフト生成（Phase 0/1・投稿はしない dry-run）
 *
 * 収集: events/ の台帳(直近の当月・翌月) → Gemini で Threads の下書きを2本生成
 *       → social/drafts/YYYY-MM-DD.md に出力（＝承認ゲート）。
 *
 * 🔴 2026-09-21、X と Instagram をやめた（オーナー判断。反応が無く、投稿もしていなかった）。
 *    Threads だけにして、そのぶん**1日2本**作る:
 *      【Threads・紹介】  … これまでと同じ「こんなの上がってたよ🎈」
 *      【Threads・問いかけ】… 読んだ人が答えたくなる問いで終える1本（別投稿として使う）
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
const HP = 'https://bonvoya.nicomaru.tokyo/f';

mkdirSync('social/drafts', { recursive: true });

// --- 収集: 台帳（events/YYYY-MM.md の直近3ファイル）---
function loadLedger() {
  let files = [];
  try { files = readdirSync('events').filter(f => /^\d{4}-\d{2}\.md$/.test(f)).sort(); } catch {}
  return files.slice(-3).map(f => `===== events/${f} =====\n${readFileSync('events/' + f, 'utf8')}`).join('\n\n');
}

// --- 重複除去: 最近のドラフト（直近10日分）を渡して同じ話題を避けさせる ---
function loadRecentDrafts() {
  let files = [];
  try { files = readdirSync('social/drafts').filter(f => /\.md$/.test(f)).sort(); } catch {}
  return files.slice(-10).map(f => readFileSync('social/drafts/' + f, 'utf8')).join('\n');
}

const PROMPT = (ledger, recent) => `あなたは、花小金井まわり（東京・小平/西東京）の子育て家庭向け無料通信「ぼんぼやーじゅ通信」のSNS担当です。
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

# 出力フォーマット（この2ブロックだけを、この見出しで出力）
【Threads・紹介】（450字以内）
- 1〜2文の紹介＋イベント名/日付/場所＋子連れ視点の一言。公式リンクが台帳にあれば1つ添える。
- 末尾に「くわしくは → ${HP}」と、ハッシュタグを4〜6個（下記の作り方に従う）。

【Threads・問いかけ】（200字以内・**紹介とは別の日に、別の投稿として出す**）
- 同じイベント/スポットについて、**読んだ人が答えたくなる問いで終える**1本。
- 🔴 **行ったことにしない。**「うちの子が」「先週行ったら」「楽しかった」など、
  **こちらが体験したように書くのは禁止。実際には行っていないので、嘘になる。**
- 代わりに「まだ行ったことがない」「今年はじめて知った」という立場から、**地元の人に聞く**。
- 聞くのは、**行く前に知りたいのに、公式に書いていないこと**。例:
  「何時ごろが空いていますか」「ベビーカーで回れますか」「駐車場は停められますか」
  「小さい子はどのくらい楽しめますか」「近くでごはんを食べるならどこですか」
- 🔴 **リンクもハッシュタグも付けない。**付けると宣伝に見えて、返事が来なくなる。
- 3〜6行。**最後の1行を問いにする。**

# ハッシュタグの作り方（重要・**【Threads・紹介】にだけ付ける**）
毎回おなじタグにせず、**その回の内容（トピック）からも必ず作る**。次の3種類を混ぜる:
1. **場所**: 開催地・エリア（例 #小平 #花小金井 #西東京 #東村山 #西武新宿線）
2. **イベント名・施設名**: その回の主役をそのままタグに（例 #西武園ゆうえんち #多摩六都科学館 #小平駐屯地 #小金井阿波おどり）。スペースや記号は除いて1語にする。
3. **ジャンル・季節**: 内容に合うもの（例 #花火 #夏祭り #盆踊り #水あそび #じゃぶじゃぶ池 #プラネタリウム #雨の日 #室内あそび #工場見学 #動物園 #紅葉 #イルミネーション）
- 共通の #子連れおでかけ は1つ入れてよいが、**残りは必ずその回の内容に合わせて変える**。
- 実在しない名称や、内容と関係ないタグは付けない。

※重要: 出力は上記【Threads・紹介】【Threads・問いかけ】の2ブロックのみ。前置き・後書き・文字数の計算・推敲メモ・思考過程・囲みの引用符（「」で全体を囲む等）は一切書かない。本文だけをそのまま出す。

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
const BLOCKS = ['【Threads・紹介】', '【Threads・問いかけ】'];
const isComplete = (t) => BLOCKS.every(b => t.includes(b));

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
  const prompt = PROMPT(loadLedger(), loadRecentDrafts());
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
        if (isComplete(r.text)) return { text: r.text, model };
        const miss = BLOCKS.filter(b => !r.text.includes(b)).join('');
        errs.push(`${model}/${maxTokens}${useThinking ? '' : '(思考なし)'}: 不完全(${miss}が欠落, finishReason=${r.finishReason})`);
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
    const head = incomplete
      ? `# ${TODAY} SNSドラフト（⚠️途中で切れています・投稿前に補ってください）`
      : `# ${TODAY} SNSドラフト（承認待ち・まだ投稿していません）`;
    body = `${head}\n\n` +
      (incomplete ? `> 生成が途中で終わり、ブロックが足りていません。欠けている分は手で書き足すか、Actions から「SNS drafts」を再実行してください。\n\n` : '') +
      `${text}\n\n---\n` +
      `※自動生成（model: ${model}）。投稿前に日付・事実・トーンを目視確認してください。\n` +
      `※【紹介】と【問いかけ】は**別の投稿**。同じ日に続けて出さず、1〜2日ずらす。\n` +
      `※【問いかけ】にリンクやハッシュタグを足さない（宣伝に見えると返事が来ない）。\n` +
      `※返ってきた答えは、おでかけマップの材料にする。\n` +
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
