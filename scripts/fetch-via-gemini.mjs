#!/usr/bin/env node
/*
 * プロキシに弾かれたページを、Gemini に代わりに読ませる。
 *
 *   node scripts/fetch-via-gemini.mjs <URL> ["聞きたいこと"]
 *   node scripts/fetch-via-gemini.mjs --search "小平市 公民館 チラシ 掲示 申請"
 *
 * ★注意: 403で弾かれたホストの回避には使わないこと。403は環境のegressポリシー拒否で、
 *       環境側のREADMEが「迂回せず報告せよ」としている。正しい対処は許可リストを広げること。
 *
 * 用途: URLが分からない調べもの(--search)、および許可されているのにサイト側の事情で
 *       読めない場合の代替。詳細は docs/sources.md「サイトが 403 で弾かれたとき」。
 *
 * もともとの動機:
 *   この実行環境は外向き通信がプロキシ経由で、行政サイトや施設サイトが 403 で弾かれることがある
 *   (city.kodaira.tokyo.jp / asta.co.jp / docs.google.com など)。
 *   Gemini は Google 側からページを取得するので、こちらのプロキシの影響を受けない。
 *
 * 必要な環境変数:
 *   GEMINI_API_KEY … GitHub Secrets に登録済み。ローカルで使うときは export して渡す。
 *
 * ★重要(ハルシネーション対策):
 *   Gemini は「取得できなかったのに、記憶から答える」ことがある。
 *   このスクリプトは url_context_metadata の取得ステータスを必ず表示し、
 *   取得に失敗していたら本文の先頭に警告を付ける。**ステータスが SUCCESS でない出力は裏取り前提で扱うこと。**
 */

const KEY = process.env.GEMINI_API_KEY || '';
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-flash-lite-latest'];

const args = process.argv.slice(2);
if (!args.length) {
  console.error(`使い方:
  node scripts/fetch-via-gemini.mjs <URL> ["聞きたいこと"]
  node scripts/fetch-via-gemini.mjs --search "検索したいこと"`);
  process.exit(2);
}
if (!KEY) {
  console.error('GEMINI_API_KEY が未設定です。GitHub Actions では Secrets から渡されます。');
  process.exit(3);
}

const searchMode = args[0] === '--search';
const target = searchMode ? args.slice(1).join(' ') : args[0];
const ask = searchMode ? '' : (args[1] || '');

const PROMPT = searchMode
  ? `次について、日本語で調べて要点をまとめてください: ${target}

# 守ること
- **出典URLを必ず添える。** 出典を示せない情報は書かない。
- 住所・電話番号・日付は、**公式サイトに書かれているものだけ**を書く。確認できなければ「未確認」と明記する。
- 推測で数字や固有名詞を作らない。`
  : `次のページを読んで、日本語で答えてください。

URL: ${target}

# 聞きたいこと
${ask || 'このページに書かれている、子育て家庭(未就学児〜小学生)に関係するイベント・日程・場所・費用・申込方法を、日付順にすべて列挙してください。'}

# 守ること
- **ページに実際に書かれていることだけ**を書く。書かれていないことは「ページに記載なし」と答える。
- ページが取得できなかった場合は、**記憶で補わず「取得できませんでした」とだけ答える**。
- 日付・電話番号・料金は原文のまま写す。`;

async function call(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }] }],
    // url_context = 指定URLをGoogle側で取得 / google_search = 検索で裏取り
    tools: searchMode ? [{ google_search: {} }] : [{ url_context: {} }, { google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) { const e = new Error(`${res.status} ${raw.slice(0, 300)}`); e.status = res.status; throw e; }
  const cand = JSON.parse(raw)?.candidates?.[0];
  const text = cand?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
  if (!text) throw new Error('空応答');
  return {
    text,
    // 実際に取得できたかの証拠。ここが SUCCESS でなければ本文は信用しない。
    urlMeta: cand?.urlContextMetadata?.urlMetadata || cand?.url_context_metadata?.url_metadata || [],
    sources: (cand?.groundingMetadata?.groundingChunks || [])
      .map(c => c.web?.uri).filter(Boolean),
  };
}

const errs = [];
let out = null;
for (const model of MODELS) {
  try { out = { ...(await call(model)), model }; break; }
  catch (e) { errs.push(`${model}: ${e.message}`); }
}
if (!out) { console.error('全モデル失敗:\n' + errs.join('\n')); process.exit(4); }

const ok = out.urlMeta.length === 0
  ? null
  : out.urlMeta.every(m => String(m.urlRetrievalStatus || m.url_retrieval_status || '').includes('SUCCESS'));

if (ok === false) {
  console.log('⚠️ ページの取得に失敗しています。以下の内容は Gemini の記憶に由来する可能性があります。必ず裏を取ってください。\n');
}
console.log(out.text.trim());
console.log('\n---');
console.log(`model: ${out.model}`);
for (const m of out.urlMeta) {
  console.log(`取得: ${m.retrievedUrl || m.retrieved_url} → ${m.urlRetrievalStatus || m.url_retrieval_status}`);
}
if (out.sources.length) console.log('出典:\n' + [...new Set(out.sources)].map(u => ' - ' + u).join('\n'));
if (ok === null && !searchMode) console.log('※取得ステータスが返りませんでした。内容は裏取り前提で扱ってください。');
