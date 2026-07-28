#!/usr/bin/env node
/*
 * その日の草案の【画像】ブロックから、Instagramフィード用カード画像(1080×1350)を作る。
 *   出力: social/drafts/ig/YYYY-MM-DD.png
 *
 * 使い方: node scripts/social/render-ig-card.mjs [YYYY-MM-DD]
 * ヘッドレスChrome(google-chrome / chromium)でHTMLを撮影する。Chromeが無い/失敗しても
 * ワークフロー全体は落とさない(終了コード0で警告のみ)。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DATE = process.argv[2]?.trim() || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const SRC = `social/drafts/${DATE}.md`;
const OUTDIR = 'social/drafts/ig';
const OUT = `${OUTDIR}/${DATE}.png`;
const TMP = `/tmp/ig-card-${DATE}.html`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseCard(md) {
  const i = md.indexOf('【画像】');
  if (i < 0) return null;
  const body = md.slice(i + '【画像】'.length).split(/\n---|\n【/)[0];
  const get = (key) => {
    const m = body.match(new RegExp(`^\\s*${key}\\s*[:：]\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const card = { title: get('見出し'), date: get('日付'), place: get('場所'), note: get('ひとこと'), tag: get('タグ') };
  return card.title ? card : null;
}

const html = (c) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;}
body{font-family:"Noto Sans CJK JP","IPAPGothic","IPAGothic","Noto Color Emoji",sans-serif;-webkit-font-smoothing:antialiased;
  background:linear-gradient(180deg,#EAF4F8 0%,#FBF6EC 55%,#FBEEDA 100%);color:#34434C;
  display:flex;flex-direction:column;padding:64px 72px 52px;position:relative;overflow:hidden;}
.top{display:flex;justify-content:space-between;align-items:center;}
.brand{font-size:34px;font-weight:800;color:#2C7C9E;letter-spacing:1px;}
.brand .eb{display:block;font-style:italic;font-size:20px;color:#EBA24A;font-weight:600;letter-spacing:1px;}
.chip{font-size:28px;font-weight:800;color:#fff;background:#EBA24A;border-radius:999px;padding:12px 34px;}
.card{margin-top:48px;margin-bottom:34px;background:#fff;border-radius:40px;padding:60px 60px 48px;box-shadow:0 18px 50px rgba(52,67,76,.10);flex:1;display:flex;flex-direction:column;}
.inner{flex:1;display:flex;flex-direction:column;justify-content:center;}
.title{font-size:76px;font-weight:800;line-height:1.28;letter-spacing:1px;}
.meta{margin-top:44px;}
.row{display:flex;gap:20px;align-items:flex-start;font-size:36px;line-height:1.5;margin-top:18px;}
.row .k{flex:none;width:150px;font-size:27px;font-weight:800;color:#fff;background:#2C7C9E;border-radius:999px;padding:8px 0;text-align:center;}
.row .v{flex:1;padding-top:4px;color:#34434C;}
.note{margin-top:52px;font-size:34px;line-height:1.65;color:#5A6B75;background:#F5F2EA;border-radius:24px;padding:32px 34px;}
.foot{margin-top:40px;padding-top:26px;border-top:3px solid #F0EBE1;display:flex;justify-content:space-between;align-items:center;font-size:27px;color:#8A98A0;}
.foot .hp{font-weight:800;color:#2C7C9E;}
</style></head><body>
  <div class="top">
    <div class="brand"><span class="eb">Bon Voyage,</span>ぼんぼやーじゅ通信</div>
    ${c.tag && c.tag !== '-' ? `<div class="chip">${esc(c.tag)}</div>` : ''}
  </div>
  <div class="card">
    <div class="inner">
    <div class="title">${esc(c.title)}</div>
    <div class="meta">
      ${c.date && c.date !== '-' ? `<div class="row"><span class="k">いつ</span><span class="v">${esc(c.date)}</span></div>` : ''}
      ${c.place && c.place !== '-' ? `<div class="row"><span class="k">どこ</span><span class="v">${esc(c.place)}</span></div>` : ''}
    </div>
    ${c.note && c.note !== '-' ? `<div class="note">${esc(c.note)}</div>` : ''}
    </div>
    <div class="foot"><span>@bonvoya_tokyo</span><span class="hp">bonvoya.nicomaru.tokyo</span></div>
  </div>
</body></html>`;

function findChrome() {
  const cands = [process.env.CHROME_PATH, 'google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  for (const c of cands) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch {}
  }
  return null;
}

if (!existsSync(SRC)) { console.warn(`草案が見つかりません: ${SRC}（画像はスキップ）`); process.exit(0); }
const card = parseCard(readFileSync(SRC, 'utf8'));
if (!card) { console.warn('【画像】ブロックが無いのでスキップしました。'); process.exit(0); }

writeFileSync(TMP, html(card));
const chrome = findChrome();
if (!chrome) { console.warn('Chromeが見つからないので画像生成をスキップしました。'); process.exit(0); }

mkdirSync(OUTDIR, { recursive: true });
try {
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb', '--window-size=1080,1350', `--screenshot=${OUT}`, `file://${TMP}`],
    { stdio: 'ignore' });
  console.log('画像を作成:', OUT, JSON.stringify(card));
} catch (e) {
  console.warn('画像生成に失敗（草案は有効）:', e.message);
}
