#!/usr/bin/env node
/*
 * LINE で送った号の「メッセージを開いた人数」「リンクごとのクリック数」を、LINE から直接取る。
 *
 * 使い方: node scripts/line-insight.mjs              … 受付番号のある、いちばん新しい号
 *         node scripts/line-insight.mjs 2026-10-28   … 号を指定
 *         node scripts/line-insight.mjs 2026-10-28 --raw … LINE の返事をそのまま出す
 * 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN（docs/line-setup.md）
 *
 * ★2026-10-26 オーナー指示で作った。それまでは解析の数字（年齢別ページを開いた回数）を
 *   「届いた人数」で割るしかなく、**メッセージを開いた人のうち何人が押したか**が分からなかった
 *   （10/21号の案内画像が効いたかを判断できなかった）。
 *   scripts/line_report.sh が、送ったときの受付番号（x-line-request-id）を sent.log の4列目に残す。
 *   その番号で LINE の「ユーザー行動の統計」（/v2/bot/insight/message/event）を引く。
 *
 * 🔴 LINE の決まり（Messaging API リファレンス「Get user interaction statistics」）:
 *   - 数字は**送ってから14日間だけ更新**される。そのあとは止まる
 *   - **20未満の数は null**（出ない）。年齢ごとのクリックのように少ない数は、解析の数字で見る
 *   - 1時間に60回まで
 *   受付番号を残し始めたのは 2026-10-28号から。それより前の号は取れない。
 */
import { readFileSync, existsSync } from 'node:fs';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN が未設定です。docs/line-setup.md の手順で設定してください。');
  process.exit(1);
}
const args = process.argv.slice(2);
const RAW = args.includes('--raw');
const want = args.find((a) => /^\d{4}-\d{2}-\d{2}/.test(a));

const LOG = 'reports/free/sent.log';
const rows = existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'))
  : [];
const hasId = (r) => r[3] && r[3].trim() !== '-';
const row = want ? rows.filter((r) => r[0] === want).pop() : rows.filter(hasId).pop();
if (!row) {
  console.error(want ? `${want} の配信の記録が ${LOG} にありません。` : '受付番号のある号が、まだありません（2026-10-28号から記録）。');
  process.exit(2);
}
if (!hasId(row)) {
  console.error(`${row[0]} の号は、受付番号を残していません（2026-10-28号から記録）。LINE からは取れないので、解析の数字で見てください。`);
  process.exit(2);
}

// 号のファイルに画像の行があれば、1つ目の吹き出しは画像（line_report.sh と同じ見分け方）
const report = row[1] && existsSync(row[1]) ? readFileSync(row[1], 'utf8') : '';
const hadImage = /<!--\s*line-image:\s*https:\/\/\S+?\.(?:jpe?g|png)\s*-->/.test(report);

const LABELS = [
  [/\/week\/[^/]+\/baby\/?$/, '👶 赤ちゃん連れのページ'],
  [/\/week\/[^/]+\/pre\/?$/, '🧒 未就学の子のページ'],
  [/\/week\/[^/]+\/elem\/?$/, '🎒 小学生のページ'],
  [/^https:\/\/bonvoya\.nicomaru\.tokyo\/?$/, '🏠 ホームページ'],
];
const labelOf = (url) => (LABELS.find(([re]) => re.test(url)) || [null, url])[1];
const num = (v) => (v == null ? '—' : String(v));
const pct = (a, b) => (a == null || !b ? '' : `${Math.round((a / b) * 1000) / 10}%`);
const jst = (sec) => new Date(sec * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

let failed = false;
for (const id of row[3].split(',').map((x) => x.trim()).filter(Boolean)) {
  const res = await fetch(`https://api.line.me/v2/bot/insight/message/event?requestId=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`取得できませんでした（HTTP ${res.status}・受付番号 ${id}）: ${body.message || ''}`);
    failed = true;
    continue;
  }
  if (RAW) { console.log(JSON.stringify(body, null, 2)); continue; }

  const o = body.overview || {};
  console.log(`■ ${row[0]} 号　受付番号 ${id}${o.timestamp ? `　送った時刻 ${jst(o.timestamp)}` : ''}`);
  console.log(`  届いた人          ${num(o.delivered)}`);
  console.log(`  開いた人          ${num(o.uniqueImpression)}${o.uniqueImpression != null ? `（届いた人の ${pct(o.uniqueImpression, o.delivered)}）` : ''}`);
  const clickNote = o.uniqueClick == null ? ''
    : `（届いた人の ${pct(o.uniqueClick, o.delivered)}${o.uniqueImpression ? `・開いた人の ${pct(o.uniqueClick, o.uniqueImpression)}` : ''}）`;
  console.log(`  リンクを押した人  ${num(o.uniqueClick)}${clickNote}`);

  const msgs = body.messages || [];
  if (msgs.length) {
    console.log('  吹き出しごとの表示回数:');
    for (const m of msgs) {
      const name = hadImage && msgs.length >= 2 ? (m.seq === 1 ? '画像' : `本文${msgs.length > 2 ? m.seq - 1 : ''}`) : `吹き出し${m.seq}`;
      console.log(`    ${name}: ${num(m.impression)}回`);
    }
  }
  const clicks = body.clicks || [];
  if (clicks.length) {
    console.log('  リンクごと（押した人／押された回数）:');
    for (const c of clicks) {
      console.log(`    ${labelOf(c.url)}: ${num(c.uniqueClickOfRequest ?? c.uniqueClick)}人／${num(c.click)}回`);
    }
  }
  console.log('  ※「—」は20未満で LINE が出さない数。数字は送ってから14日間更新される');
}
if (failed) process.exit(3);
