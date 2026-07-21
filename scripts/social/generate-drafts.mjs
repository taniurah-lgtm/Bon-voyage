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
  : ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
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

# トーン（厳守）
- やさしく淡々と。売り込まない。「急いで」「損」「今だけ」等の煽りは使わない。
- 事実ベース（イベント名・日付・場所）。日付は本日以降のものだけ（過去日は選ばない）。台帳に日付の裏取りメモがあれば尊重。
- 「こんなの見つけたよ🎈」くらいの、地元のおすそわけの空気。

# 出力フォーマット（この2つを必ず）
【Threads】（450字以内）
- 1〜2文の紹介＋イベント名/日付/場所＋子連れ視点の一言。公式リンクが台帳にあれば1つ添える。
- 末尾に「くわしくは → ${HP}」と、ハッシュタグを2〜3個（例 #花小金井 #小平 #子連れおでかけ）。
【X】（130字以内）
- 上を短く。末尾に ${HP} とハッシュタグ1〜2個。

# 重複回避
次の【最近の投稿】と同じイベントは選ばない：
${recent || '(なし)'}

# もし該当が無い場合
「本日以降の適当なイベントが台帳に見当たりませんでした」とだけ書く。

【台帳】
${ledger}
`;

async function gen() {
  const prompt = PROMPT(loadLedger(), loadRecentDrafts());
  const errs = [];
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });
    } catch (e) { errs.push(`${model}: ${e.message}`); continue; }
    if (!res.ok) { errs.push(`${model}: ${res.status} ${(await res.text()).slice(0, 220)}`); continue; }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (text) return { text, model };
    errs.push(`${model}: 空応答`);
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
console.log('wrote', out);
