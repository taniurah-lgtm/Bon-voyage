// 館のおたより（今月号・来月号）を決める（2026-11-28 オーナー「月末に翌月の情報を知りたい人もいる。月初めの更新では遅い」）。
//   data/teirei.json の place に otayori（今月号）と otayoriNext（来月号）を書ける。月が替わったら、来月号が自動で「今月号」になる
//   （手で差し替えなくても古くならない）。URLの形が決まっている館（otayoriPattern）は、scripts/check-otayori.mjs が
//   来月号が出たかを見て data/otayori-auto.json に書く（ページを組むたびに読む）
import { readFileSync, existsSync } from 'node:fs';

const AUTO = existsSync('data/otayori-auto.json') ? JSON.parse(readFileSync('data/otayori-auto.json', 'utf8')) : {};
export const thisMonth = (today) => today.slice(0, 7);

// { cur: 今月号（無ければ、いちばん新しい過去の号）, next: 来月号（出ていれば） }
export function otayoriOf(p, today) {
  const ym = thisMonth(today);
  const all = [p.otayori, p.otayoriNext, ...((AUTO[p.key] || []))].filter((x) => x && x.url && x.month && x.label);
  const byMonth = new Map();
  for (const x of all) if (!byMonth.has(x.month)) byMonth.set(x.month, x);
  const ms = [...byMonth.keys()].sort();
  const curM = ms.filter((m) => m <= ym).pop();
  const nextM = ms.find((m) => m > ym);
  return { cur: curM ? byMonth.get(curM) : null, next: nextM ? byMonth.get(nextM) : null };
}
