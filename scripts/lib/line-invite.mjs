// LINE の通信への案内（2026-11-28 オーナー「スクールガイドや子連れカフェは、検索から入ってくる可能性が高い。LINE読者への導線が必要」）。
//   検索から来た人は、通信のことを知らない。ページの上・一覧のとちゅう・ページの下の3か所に、急かさない形で置く。
//   - お金や「急いで」「損」は書かない（CLAUDE.md「トーン最重要」）。書くのは、何が・いつ・どう届くかだけ
//   - 登録する前に中身を見られるように「今週の号をのぞいてみる」（最新の送った号の年齢別ページ）を添える
//   - 押された数は、置いた場所ごとに数える（data-pos。assets/analytics.js が「LINE追加｜入口｜ページ｜場所」で数える）
import { readFileSync, existsSync } from 'node:fs';

export const LINE_URL = 'https://lin.ee/YtcfjnX';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 最新の「送った号」（sent.log に載った号だけ。送る前の号はサイトに出さない）
export function latestIssue(today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) {
  if (!existsSync('reports/free/sent.log')) return null;
  const ds = readFileSync('reports/free/sent.log', 'utf8').trim().split('\n').map((l) => l.split('\t')[0]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today).sort();
  const d = ds[ds.length - 1];
  return d ? { date: d, url: `/week/${d}/pre/` } : null;
}

export const INVITE_CSS = `
  .lv-slim { display: flex; flex-wrap: wrap; align-items: center; gap: .1rem .6rem; margin: .6rem 0 0; padding: .55rem .8rem; border-radius: 12px;
    background: var(--surface-2); border: 1px solid var(--line); font-size: .82rem; line-height: 1.6; color: var(--ink-soft); }
  .lv-slim a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 800; color: #057A39; text-decoration: underline; text-underline-offset: 3px; }
  .lv-card { margin: 1.4rem 0; padding: 1.1rem 1.1rem 1rem; border-radius: 16px; background: var(--surface-2); border: 1px solid rgba(6,199,85,.35); }
  .lv-card h2, .lv-card .lv-h { font-family: var(--maru); font-weight: 800; font-size: 1.02rem; line-height: 1.45; margin: 0 0 .4rem; }
  .lv-card p { margin: 0 0 .75rem; font-size: .88rem; line-height: 1.75; color: var(--ink-soft); }
  .lv-bs { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .9rem; }
  .lv-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .4rem 1.4rem; border-radius: 999px; background: #06C755; color: #fff !important;
    font-weight: 800; font-size: .95rem; text-decoration: none; box-shadow: 0 4px 14px rgba(6,199,85,.25); }
  .lv-peek { display: inline-flex; align-items: center; min-height: 44px; font-weight: 800; font-size: .86rem; color: var(--sky-deep); }
  .lv-note { display: block; margin-top: .55rem; font-size: .74rem; color: var(--ink-soft); }
  @media (max-width: 480px) { .lv-btn { width: 100%; } }
`;

// ページの上の1行
export function inviteSlim({ text, pos = 'ページの上' }) {
  return `<p class="lv-slim"><span>📮 ${esc(text)}</span><a href="${LINE_URL}" target="_blank" rel="noopener" data-pos="${esc(pos)}">LINEで受け取る（無料）</a></p>`;
}

// 一覧のとちゅう・ページの下のカード
export function inviteCard({ head, body, pos, issue, tag = 'aside' }) {
  const peek = issue ? `<a class="lv-peek" href="${esc(issue.url)}" data-goatcounter-click="${esc(`通信の見本｜${pos}`)}">今週の号をのぞいてみる →</a>` : '';
  return `<${tag} class="lv-card" aria-label="LINEの通信のご案内">
    <p class="lv-h">${esc(head)}</p>
    <p>${esc(body)}</p>
    <div class="lv-bs"><a class="lv-btn" href="${LINE_URL}" target="_blank" rel="noopener" data-pos="${esc(pos)}">LINEで受け取る（無料）</a>${peek}</div>
    <span class="lv-note">友だち追加だけで届きます。お名前などの入力はいりません。</span>
  </${tag}>`;
}
