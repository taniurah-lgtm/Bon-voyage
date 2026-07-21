#!/usr/bin/env node
/*
 * Threads へ「その日のドラフトの【Threads】ブロック」を投稿する（Phase 2）。
 * 承認フロー: ドラフト(social/drafts/DATE.md)を人が見てOKなら、この workflow を手動実行 → 投稿。
 *
 * 必要な環境変数（GitHub Secrets）:
 *   THREADS_USER_ID        … Threads の数値ユーザーID
 *   THREADS_ACCESS_TOKEN   … threads_basic + threads_content_publish 権限のトークン（長期推奨）
 * 任意:
 *   POST_DATE=YYYY-MM-DD    … 投稿する草案の日付（未指定なら今日JST）
 *   THREADS_DRY_RUN=1       … 投稿せず本文だけ表示（トークン未設定時も自動でdry-run）
 *   THREADS_FORCE=1         … 同じ日付を既に投稿済みでも投稿する
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DATE = process.env.POST_DATE?.trim() || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const USER = process.env.THREADS_USER_ID || '';
const TOKEN = process.env.THREADS_ACCESS_TOKEN || '';
const DRY = process.env.THREADS_DRY_RUN === '1' || !USER || !TOKEN;
const FORCE = process.env.THREADS_FORCE === '1';
const API = 'https://graph.threads.net/v1.0';
const STATE = 'social/state/threads-posted.json';

function extractThreads(md) {
  const i = md.indexOf('【Threads】');
  if (i < 0) throw new Error('ドラフトに【Threads】ブロックがありません');
  let s = md.slice(i + '【Threads】'.length);
  const j = s.indexOf('【X】');
  if (j >= 0) s = s.slice(0, j);
  s = s.replace(/^\s*（[^）]*）\s*/, '').trim(); // 先頭の「（…字以内）」除去
  return s;
}
function loadLog() { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return []; } }

const path = `social/drafts/${DATE}.md`;
let md;
try { md = readFileSync(path, 'utf8'); } catch { throw new Error(`ドラフトが見つかりません: ${path}`); }
if (/生成エラー|未生成/.test(md)) throw new Error(`このドラフトは投稿できません（生成エラー/未生成）: ${path}`);

const text = extractThreads(md);
if (!text) throw new Error('Threads本文が空です');
if (text.length > 500) throw new Error(`Threads本文が500字を超えています（${text.length}字）。ドラフトを短くしてください。`);

console.log(`--- ${DATE} 投稿する本文（${text.length}字）---\n${text}\n----------------------------------------`);

const log = loadLog();
if (!FORCE && log.some(e => e.date === DATE)) {
  console.log(`スキップ: ${DATE} は既に投稿済みです（再投稿は THREADS_FORCE=1）。`);
  process.exit(0);
}
if (DRY) {
  console.log('DRY-RUN: 実際には投稿しません（トークン未設定 or THREADS_DRY_RUN=1）。');
  process.exit(0);
}

async function api(endpoint, params) {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    body: new URLSearchParams({ ...params, access_token: TOKEN }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Threads API ${res.status} (${endpoint}): ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

// 1) コンテナ作成 → 2) 数秒待って publish（Threads推奨）
const created = await api(`${USER}/threads`, { media_type: 'TEXT', text });
if (!created.id) throw new Error('creation id が返りませんでした: ' + JSON.stringify(created));
await new Promise(r => setTimeout(r, 3000));
const published = await api(`${USER}/threads_publish`, { creation_id: created.id });
console.log('投稿完了:', JSON.stringify(published));

mkdirSync('social/state', { recursive: true });
log.push({ date: DATE, id: published.id || created.id, at: new Date().toISOString() });
writeFileSync(STATE, JSON.stringify(log, null, 2) + '\n');
console.log('記録:', STATE);
