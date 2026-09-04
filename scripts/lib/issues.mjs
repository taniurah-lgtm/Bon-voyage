/*
 * 過去号（reports/free/*.md）を読んで、そのままページに置ける形にする。
 * 公開のバックナンバー（scripts/build-issues.mjs）と、合言葉つきのページ
 * （scripts/build-members.mjs）の両方から使う。二重に持つと片方だけ直る。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { esc } from './gate.mjs';

const DIR = 'reports/free';

// 号の本文に残る内部用語を、読者向けの言い方に直す。
// 「巡回」は運営側の作業名、「★駅前・地元」は台帳の絞り込みマーカーで、
// どちらも読む人には意味が通らない（原文をそのまま貼っているので残っていた）。
const WORDS = [
  [/毎月中旬の巡回で/g, '毎月中旬に'],
  [/来月中旬の巡回で/g, '来月中旬に'],
  [/次回の巡回で/g, '次回のお便りで'],
  [/巡回で/g, 'こちらで'],
  [/巡回時に/g, 'おでかけ前に'],
  [/\s*★[^\s、。]*(?=\s|$)/g, ''],
];
export const fixWords = (t) => WORDS.reduce((acc, [re, to]) => acc.replace(re, to), t);

// 号の本文に混ざっていた作業用の行を落とす（`</content>` が読者に見えていた）
export const stripArtifacts = (body) =>
  body
    .split('\n')
    .filter((l) => !/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(l))
    .join('\n')
    .trim();

// 過去号は原文のまま置くが、あとで取り下げた記載には訂正を添える。
// ★号は「その日にお届けしたもの」なので書き換えない。訂正を上に足す。
const CORRECTIONS = [
  [/登録代行|登録を代行/, 'この号にある「カレンダー登録の代行」は、その後**ワンタップでご自分のカレンダーに保存いただく形**に変わりました。運営が代わりに登録することはしていません。'],
  [/わき水広場/, 'この号でご紹介した小金井公園「わき水広場」は、その後の確認で**実在が確かめられなかった**ため、掲載を取り下げました。'],
  [/有料版希望|フォームからどうぞ/, 'この号にある「フォームからどうぞ」のご案内は、いまは使っていません。'],
  [/月300円|サポーター|応援サポーター/, 'この号にある**月300円のサポーター制度は、2026年9月4日に廃止**しました。通信はこれからも無料でお届けします。'],
];

/** 新しい号が先頭。{ file, y, m, d, wd, linked, fixes[] } の配列を返す */
export function readIssues(dir = DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))   // _draft- は除く
    .sort()
    .reverse()
    .map((f) => {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      const [y, m, d] = f.replace('.md', '').split('-').map(Number);
      const wd = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      // 1行目の題名は日付が入っているので、見出しは呼ぶ側で組む
      const body = fixWords(stripArtifacts(raw.split('\n').slice(1).join('\n')));
      // 号のなかのURLは、読めるだけでなく押せるようにする（素テキストだと開けない）。
      // ★終端を「空白・和文の記号・引用符」までにする。\w だけだと日本語の直前で切れて
      //   「?api=1&query=」のような空クエリのリンクができる。
      const linked = esc(body).replace(
        /https?:\/\/[^\s<>"'）」』、。]+/g,
        (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`
      );
      const fixes = CORRECTIONS.filter(([re]) => re.test(body)).map(([, note]) =>
        `<p class="issue-fix">📝 ${note.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`
      );
      return { file: f, y, m, d, wd, linked, fixes };
    });
}

/** <details> の並びを組む（会員ページ・公開ページで同じ見た目） */
export function issuesHTML(issues) {
  return issues
    .map((i) => `  <details class="issue">
    <summary>${i.y}年${i.m}月${i.d}日(${i.wd})号${i.fixes.length ? '<span class="issue-hasfix">訂正あり</span>' : ''}</summary>
    <div class="issue-body">${i.fixes.join('')}${i.linked}</div>
  </details>`)
    .join('\n');
}
