#!/usr/bin/env node
/*
 * reports/free/ の最新号を読み、ホームページの「最新号のプレビュー」を書き換える。
 *
 * 使い方: node scripts/update-homepage-preview.mjs <index.htmlのパス> [レポートのパス]
 *   例) node scripts/update-homepage-preview.mjs site/docs/homepage/index.html
 * レポート省略時は reports/free/ の最新日付のファイルを使う。
 *
 * index.html 側の <!-- ISSUE:START --> 〜 <!-- ISSUE:END --> の間だけを差し替える。
 * 変更が無ければ何も書かない(終了コード0・"NO_CHANGE" を出力)。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const HTML_PATH = process.argv[2];
if (!HTML_PATH) { console.error('使い方: node scripts/update-homepage-preview.mjs <index.html> [report.md]'); process.exit(2); }

function latestReport() {
  const dir = 'reports/free';
  const files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  if (!files.length) throw new Error('reports/free に号がありません');
  return `${dir}/${files[files.length - 1]}`;
}
const REPORT_PATH = process.argv[3] || latestReport();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 全角括弧に寄せ、通信のプレーンテキストをHTML向けに整える
const tidy = (s) => esc(s.trim()).replace(/\(/g, '（').replace(/\)/g, '）');

// 「👶○(...) / 🧒◎ / 🎒◎」→ 「👶 ○　🧒 <b>◎</b>　🎒 <b>◎</b>」
function agesHtml(line) {
  const out = [];
  for (const m of line.matchAll(/(👶|🧒|🎒)\s*([◎○△✕×])/g)) {
    out.push(`${m[1]} ${m[2] === '◎' ? `<b>${m[2]}</b>` : m[2]}`);
  }
  return out.length ? `<div class="ages">${out.join('　')}</div>` : '';
}

function parseReport(text) {
  const lines = text.split(/\r?\n/);
  const head = lines.find(l => l.includes('ぼんぼやーじゅ通信')) || '';
  const md = head.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*[（(]\s*(.)\s*[）)]/);
  const year = (REPORT_PATH.match(/(\d{4})-\d{2}-\d{2}/) || [])[1] || new Date().getFullYear();
  const dateLabel = md ? `${year} / ${md[1]} / ${md[2]}（${md[3]}）号` : `${year} 最新号`;

  // ■見出し ごとに本文をまとめる（━ の区切り以降＝フッターは捨てる）
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^[━─-]{5,}/.test(l)) break;
    if (l.startsWith('■')) { cur = { title: l.replace(/^■\s*/, ''), body: [] }; sections.push(cur); continue; }
    if (cur && l) cur.body.push(l);
  }
  return { dateLabel, sections };
}

// 「🎇 西武園ゆうえんち 大夏祭り・花火(7/25土 19:30〜約6分)」＋説明＋年齢行 → item HTML
function itemHtml(body) {
  if (!body.length) return '';
  const first = body[0];
  const sp = first.indexOf(' ');
  const emoji = sp > 0 ? first.slice(0, sp) : '🎈';
  const name = sp > 0 ? first.slice(sp + 1) : first;
  const desc = [], ages = [];
  for (const l of body.slice(1)) {
    if (/^(👶|🧒|🎒)/.test(l)) { ages.push(l); continue; }
    if (/^📍|^🔗|^https?:/.test(l)) continue;   // 地図・URLはホームページでは出さない
    desc.push(l);
  }
  return `          <div class="item">
            <div class="h"><span class="em">${esc(emoji)}</span>${tidy(name)}</div>
            <div class="m">${tidy(desc.join(' '))}</div>
            ${agesHtml(ages.join(' '))}
          </div>`;
}

function buildHtml({ dateLabel, sections }) {
  const find = (re) => sections.find(s => re.test(s.title));
  const weather = find(/天気/) && !/室内/.test(find(/天気/).title) ? find(/天気/) : sections.find(s => /天気/.test(s.title) && !/室内/.test(s.title));
  const indoor = sections.find(s => /室内|雨/.test(s.title));
  const pick = sections.find(s => /一推し|おすすめ/.test(s.title) && !/室内|雨/.test(s.title));
  const ahead = sections.find(s => /先取り/.test(s.title));

  const blocks = [];
  if (weather) {
    blocks.push(`        <div class="blk">
          <h4>${tidy(weather.title)}</h4>
          <p class="item m">${tidy(weather.body.join(' '))}</p>
        </div>`);
  }
  if (indoor) {
    blocks.push(`        <div class="blk">
          <h4>${tidy(indoor.title)}</h4>
${itemHtml(indoor.body)}
        </div>`);
  }
  if (pick) {
    blocks.push(`        <div class="blk">
          <h4>${tidy(pick.title)}</h4>
${itemHtml(pick.body)}
        </div>`);
  }
  if (ahead) {
    const items = ahead.body.filter(l => /^[・･]/.test(l)).map(l => `            <li>${tidy(l.replace(/^[・･]\s*/, ''))}</li>`);
    if (items.length) {
      blocks.push(`        <div class="blk">
          <h4>${tidy(ahead.title)}</h4>
          <ul class="takeaway">
${items.join('\n')}
          </ul>
        </div>`);
    }
  }

  return `    <article class="issue">
      <div class="issue-top">
        <span class="t">ぼんぼやーじゅ通信</span>
        <span class="d">${esc(dateLabel)}</span>
      </div>
      <div class="issue-body">
        <p class="issue-legend">〔目安〕👶あかちゃん(0-2) ／ 🧒未就学(3-6) ／ 🎒小学生　◎ぴったり ○だいじょうぶ △ひと工夫</p>

${blocks.join('\n\n')}
      </div>
    </article>`;
}

const report = readFileSync(REPORT_PATH, 'utf8');
const parsed = parseReport(report);
if (!parsed.sections.length) { console.error(`レポートに ■ セクションがありません: ${REPORT_PATH}`); process.exit(1); }

const html = readFileSync(HTML_PATH, 'utf8');
const START = '<!-- ISSUE:START', END = '<!-- ISSUE:END -->';
const si = html.indexOf(START), ei = html.indexOf(END);
if (si < 0 || ei < 0) { console.error('index.html に ISSUE:START / ISSUE:END マーカーがありません'); process.exit(1); }
const startTagEnd = html.indexOf('-->', si) + 3;

const next = html.slice(0, startTagEnd) + '\n' + buildHtml(parsed) + '\n    ' + html.slice(ei);
if (next === html) { console.log('NO_CHANGE'); process.exit(0); }
writeFileSync(HTML_PATH, next);
console.log(`UPDATED ${HTML_PATH} <- ${REPORT_PATH} (${parsed.dateLabel})`);
