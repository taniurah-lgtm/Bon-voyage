#!/usr/bin/env node
/*
 * SNS投稿ドラフト生成（Phase 0/1・投稿はしない dry-run）
 *
 * 収集: events/ の台帳(直近の当月・翌月) → Gemini で「こんなの上がってたよ🎈」風の
 *       Threads/X ドラフトを生成 → social/drafts/YYYY-MM-DD.md に出力（＝承認ゲート）。
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
【Threads】（450字以内）
- 1〜2文の紹介＋イベント名/日付/場所＋子連れ視点の一言。公式リンクが台帳にあれば1つ添える。
- 末尾に「くわしくは → ${HP}」と、ハッシュタグを4〜6個。
【X】（130字以内）
- 上を短く。末尾に ${HP} とハッシュタグ3〜4個（下記の作り方は同じ）。

# ハッシュタグの作り方（重要）
毎回おなじタグにせず、**その回の内容（トピック）からも必ず作る**。次の3種類を混ぜる:
1. **場所**: 開催地・エリア（例 #小平 #花小金井 #西東京 #東村山 #西武新宿線）
2. **イベント名・施設名**: その回の主役をそのままタグに（例 #西武園ゆうえんち #多摩六都科学館 #小平駐屯地 #小金井阿波おどり）。スペースや記号は除いて1語にする。
3. **ジャンル・季節**: 内容に合うもの（例 #花火 #夏祭り #盆踊り #水あそび #じゃぶじゃぶ池 #プラネタリウム #雨の日 #室内あそび #工場見学 #動物園 #紅葉 #イルミネーション）
- 共通の #子連れおでかけ は1つ入れてよいが、**残りは必ずその回の内容に合わせて変える**。
- 実在しない名称や、内容と関係ないタグは付けない。

※重要: 出力は上記【Threads】【X】の2ブロックのみ。前置き・後書き・文字数の計算・推敲メモ・思考過程・囲みの引用符（「」で全体を囲む等）は一切書かない。本文だけをそのまま出す。

# 重複回避
次の【最近の投稿】と同じイベントは選ばない：
${recent || '(なし)'}

# もし該当が無い場合
「本日以降の適当なイベントが台帳に見当たりませんでした」とだけ書く。

【台帳】
${ledger}
`;

async function callGemini(model, prompt, useThinking) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const generationConfig = { temperature: 0.7, maxOutputTokens: 4096 };
  if (useThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // 2.5系: 思考OFFで無駄トークン削減
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
  });
  const raw = await res.text();
  if (!res.ok) { const err = new Error(`${res.status} ${raw.slice(0, 200)}`); err.status = res.status; throw err; }
  const text = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('空応答');
  return text;
}

async function gen() {
  const prompt = PROMPT(loadLedger(), loadRecentDrafts());
  const errs = [];
  for (const model of MODELS) {
    // まず thinkingBudget:0 で試し、400（thinkingConfig非対応など）なら同じモデルを思考指定なしで再試行
    for (const useThinking of [true, false]) {
      try {
        return { text: await callGemini(model, prompt, useThinking), model };
      } catch (e) {
        errs.push(`${model}${useThinking ? '' : '(思考なし)'}: ${e.message}`);
        if (e.status !== 400) break; // 404/429など: 思考なし再試行は無駄→次モデルへ
      }
    }
  }
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
    const { text, model } = await gen();
    body = `# ${TODAY} SNSドラフト（承認待ち・まだ投稿していません）\n\n` +
      `${text}\n\n---\n` +
      `※自動生成（model: ${model}）。投稿前に日付・事実・トーンを目視確認してください。飛び先は ${HP} に統一。\n`;
    console.log('生成OK:', out, 'model:', model);
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
