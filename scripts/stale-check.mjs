#!/usr/bin/env node
/*
 * 台帳のうち「いま裏を取り直すべきもの」を、優先順に出す。
 *   node scripts/stale-check.mjs [件数]
 *
 * 🔴 なぜ要るか（2026-09-21）
 *   台帳には、観光協会のカレンダーから拾った1行だけの回が溜まる。
 *   そのまま号に出す直前まで放置され、直前に調べると中身が化けることが続いた。
 *     - E116 新小平マーケット … 1行だけ →「子ども駅長の制服体験」があった
 *     - E117 親子うどん打ち体験会 … 1行だけ → 申込開始が2日後・先着だった
 *     - E134 小平市民まつり … 市の常設ページは前年のまま。市報にだけ今年の日付があった
 *   公式は「あとから」更新される。こちらが見に行かないと気づけない。
 *
 * ★毎回ぜんぶ見ない。費用が出ない。
 *   「近いのに穴がある」ものから順に、少しずつ潰す。7日以内に確認済みのものは飛ばす。
 */
import { readFileSync, readdirSync } from 'node:fs';

const LIMIT = Number(process.argv[2] || 5);
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const files = readdirSync('events').filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).sort();
const blocks = [];
for (const f of files) {
  const src = readFileSync('events/' + f, 'utf8');
  for (const b of src.split(/\n(?=### )/)) {
    const m = /^### (E\d+)\.\s*(.*)$/m.exec(b);
    if (m) blocks.push({ file: f, id: m[1], name: m[2].replace(/\*\*/g, '').split('★')[0].trim(), body: b });
  }
}

// 「2026-09-19」「2026-08-15」のような確認日を、確度の行から拾う
const checkedOn = (b) => {
  const line = (b.body.split('\n').find((l) => /^\s*-\s*(\*\*)?確度/.test(l)) || '');
  const d = line.match(/20\d\d-\d\d-\d\d/);
  return d ? d[0] : null;
};
const field = (b, key) => {
  const re = new RegExp('^\\s*[-*+]\\s*(?:[^\\p{L}\\p{N}\\s*:：]+\\s*)?(?:\\*\\*)?' + key + '[^:：]{0,12}[:：]\\s*(.+)$', 'mu');
  const m = re.exec(b.body);
  return m ? m[1].replace(/\*\*/g, '').trim() : '';
};
// 開催日（M/D でも YYYY年M月D日 でも拾う）。いちばん早い未来の日を返す
const nextDate = (b) => {
  const when = field(b, '日時') + ' ' + field(b, '会期') + ' ' + field(b, '期間');
  const year = Number(b.file.slice(0, 4));
  const out = [];
  const s = when
    .replace(/(?:\d{4}\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, '$1/$2');
  for (const m of s.matchAll(/(\d{1,2})\/(\d{1,2})/g)) {
    const mm = Number(m[1]), dd = Number(m[2]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) continue;
    // 台帳のファイル名の年を使う。1月のものが12月ファイルに入る回は翌年扱い
    let y = year;
    if (Number(b.file.slice(5, 7)) >= 11 && mm <= 2) y = year + 1;
    const iso = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (iso >= today) out.push(iso);
  }
  return out.sort()[0] || null;
};
const deadline = (b) => {
  const m = b.body.match(/締切[^\n]{0,8}?(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const y = Number(b.file.slice(0, 4));
  return `${y}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
};

const rows = [];
for (const b of blocks) {
  const status = field(b, 'ステータス') || (b.body.match(/ステータス[:：]\s*(.+)/) || [])[1] || '';
  if (/終了|見送り/.test(status)) continue;
  const when = nextDate(b);
  const dl = deadline(b);
  if (!when && !dl) continue;                 // 日付が無いものはここでは扱わない
  const soon = when && when <= plus(21);
  const dlSoon = dl && dl >= today && dl <= plus(7);
  if (!soon && !dlSoon) continue;             // 3週間より先は、まだ急がない

  const last = checkedOn(b);
  if (last && last >= plus(-7)) continue;     // 7日以内に確認済みなら飛ばす

  const holes = [];
  if (/要確認|未確認|未取得|未発表|記載なし/.test(b.body)) holes.push('要確認が残っている');
  if (!field(b, '料金') && !field(b, '費用') && !field(b, '参加費')) holes.push('料金が無い');
  if (!field(b, '内容')) holes.push('内容が無い');
  if (!field(b, '場所')) holes.push('場所が無い');
  if (!/子連れ/.test(b.body)) holes.push('年齢の目安が無い');
  if (!last) holes.push('確認日が記録されていない');
  if (!holes.length) continue;

  // 近いほど・穴が多いほど上に
  const days = when ? Math.round((Date.parse(when) - Date.parse(today)) / 86400000) : 99;
  rows.push({ ...b, when, dl, days, holes, last, status: status.split(/\s|\(/)[0], score: holes.length * 10 - days });
}
rows.sort((a, b) => b.score - a.score);

const pick = rows.slice(0, LIMIT);
console.log(`【裏取りの候補】${today} 時点 — ${rows.length}件が該当、上から ${pick.length}件を出します`);
console.log('');
for (const r of pick) {
  console.log(`■ ${r.id} ${r.name}`);
  console.log(`   開催: ${r.when || '—'}${r.dl ? ` / 締切: ${r.dl}` : ''}（あと${r.days}日）  台帳: events/${r.file}`);
  console.log(`   最後に確認: ${r.last || '記録なし'}`);
  console.log(`   埋めるもの: ${r.holes.join(' / ')}`);
  console.log('');
}
if (!pick.length) console.log('  いま急いで裏を取るものはありません。');
