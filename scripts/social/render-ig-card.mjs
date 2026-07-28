#!/usr/bin/env node
/*
 * その日の草案の【画像】ブロックから、Instagramフィード用カード画像(1080×1350)を作る。
 *   出力: social/drafts/ig/YYYY-MM-DD.png
 *
 * 写真: social/photos/<カテゴリ>/ にある自前写真から内容に合うものを自動で選ぶ。
 *       無ければ social/photos/_default/ を使い、それも無ければ写真なしデザインになる。
 *       ※必ず自分で撮った写真か、商用利用可のライセンス素材だけを置くこと(公式サイトの写真は不可)。
 *
 * 使い方: node scripts/social/render-ig-card.mjs [YYYY-MM-DD]
 * ヘッドレスChrome(google-chrome / chromium)で撮影する。失敗してもワークフローは落とさない。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const DATE = process.argv[2]?.trim() || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const SRC = `social/drafts/${DATE}.md`;
const OUTDIR = 'social/drafts/ig';
const OUT = `${OUTDIR}/${DATE}.png`;
const TMP = `/tmp/ig-card-${DATE}.html`;
const PHOTOS = 'social/photos';

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

// 内容(見出し・タグ・ひとこと)から写真カテゴリを判定
const RULES = [
  ['fireworks', /花火|大火祭/],
  ['festival', /祭|盆踊|縁日|阿波おど|サンバ|マルシェ/],
  ['water', /水あそび|水遊び|じゃぶじゃぶ|プール|川遊び|水辺/],
  ['museum', /科学館|博物館|プラネタリウム|美術館|資料館|たてもの園/],
  ['train', /電車|鉄道|車両|線|駅/],
  ['animal', /動物|牧場|水族館|ふれあい| zoo/i],
  ['camp', /キャンプ|BBQ|バーベキュー|アウトドア/],
  ['indoor', /室内|屋内|雨の日|あそび場|図書館|児童館|ショッピング/],
  ['park', /公園|広場|原っぱ|グリーン|散歩|遊具/],
];
function pickCategory(c) {
  const text = `${c.tag} ${c.title} ${c.note} ${c.place}`;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'park';
}
function listPhotos(dir) {
  try {
    return readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => `${dir}/${f}`);
  } catch { return []; }
}
function pickPhoto(cat) {
  let files = listPhotos(`${PHOTOS}/${cat}`);
  if (!files.length) files = listPhotos(`${PHOTOS}/_default`);
  if (!files.length) return null;
  // 日付で決めるので同じ日は同じ写真・日が変われば順に巡る
  const seed = Number(DATE.replace(/-/g, '')) || 0;
  return resolve(files[seed % files.length]);
}

const html = (c, photo) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;}
body{font-family:"Noto Sans CJK JP","IPAPGothic","IPAGothic","Noto Color Emoji",sans-serif;-webkit-font-smoothing:antialiased;
  background:#FBFAF5;color:#2B3A42;position:relative;overflow:hidden;}
.hero{position:absolute;top:0;left:0;width:1080px;height:660px;
  ${photo ? `background-image:linear-gradient(180deg,rgba(20,45,58,.42) 0%,rgba(20,45,58,.12) 38%,rgba(20,45,58,.55) 100%),url('file://${photo}');`
          : `background-image:linear-gradient(160deg,#4FA3C4,#2C7C9E);`}
  background-size:cover;background-position:center 55%;}
.brand{position:absolute;top:52px;left:64px;color:#fff;font-size:36px;font-weight:800;letter-spacing:1px;text-shadow:0 2px 14px rgba(0,0,0,.45);}
.brand .eb{display:block;font-style:italic;font-size:21px;color:#FFD9A3;font-weight:600;letter-spacing:1px;}
.chip{position:absolute;top:56px;right:64px;font-size:29px;font-weight:800;color:#2C7C9E;background:rgba(255,255,255,.95);border-radius:999px;padding:13px 36px;box-shadow:0 6px 18px rgba(0,0,0,.18);}
.sheet{position:absolute;left:0;right:0;bottom:0;height:770px;background:#FBFAF5;border-radius:52px 52px 0 0;padding:52px 64px 122px;display:flex;flex-direction:column;}
.title{font-size:70px;font-weight:800;line-height:1.26;letter-spacing:.5px;color:#22323B;}
.meta{margin-top:36px;}
.row{display:flex;gap:20px;align-items:flex-start;font-size:35px;line-height:1.45;margin-top:16px;}
.row .k{flex:none;width:142px;font-size:26px;font-weight:800;color:#fff;background:#2C7C9E;border-radius:999px;padding:9px 0;text-align:center;}
.row .v{flex:1;padding-top:3px;}
.note{margin-top:34px;font-size:33px;line-height:1.6;color:#55666F;background:#F1EDE3;border-radius:26px;padding:30px 32px;}
.foot{margin-top:auto;padding-top:24px;border-top:3px solid #E8E2D5;display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#8A98A0;}
.foot .hp{font-weight:800;color:#2C7C9E;}
</style></head><body>
  <div class="hero"></div>
  <div class="brand"><span class="eb">Bon Voyage,</span>ぼんぼやーじゅ通信</div>
  ${c.tag && c.tag !== '-' ? `<div class="chip">${esc(c.tag)}</div>` : ''}
  <div class="sheet">
    <div class="title">${esc(c.title)}</div>
    <div class="meta">
      ${c.date && c.date !== '-' ? `<div class="row"><span class="k">いつ</span><span class="v">${esc(c.date)}</span></div>` : ''}
      ${c.place && c.place !== '-' ? `<div class="row"><span class="k">どこ</span><span class="v">${esc(c.place)}</span></div>` : ''}
    </div>
    ${c.note && c.note !== '-' ? `<div class="note">${esc(c.note)}</div>` : ''}
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

const cat = pickCategory(card);
const photo = pickPhoto(cat);
writeFileSync(TMP, html(card, photo));

const chrome = findChrome();
if (!chrome) { console.warn('Chromeが見つからないので画像生成をスキップしました。'); process.exit(0); }

mkdirSync(OUTDIR, { recursive: true });
try {
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb', '--window-size=1080,1350', `--screenshot=${OUT}`, `file://${TMP}`],
    { stdio: 'ignore' });
  console.log('画像を作成:', OUT, '| カテゴリ:', cat, '| 写真:', photo || '(なし)');
} catch (e) {
  console.warn('画像生成に失敗（草案は有効）:', e.message);
}
