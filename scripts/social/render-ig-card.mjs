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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const W = 1080, H = 1350;           // Instagramフィード比率 4:5(変更しない)
const SHOT_PAD = 90;                // ヘッドレスの窓枠ぶん高めに撮って、あとで下を切り落とす
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

// 見出しの長さに応じて字を詰めすぎない範囲で自動縮小する
function titleSize(t) {
  const n = [...String(t)].length;
  if (n <= 9) return 92;
  if (n <= 12) return 82;
  if (n <= 16) return 70;
  if (n <= 22) return 60;
  if (n <= 30) return 52;
  return 46;
}
// 「8/29(土) 10:00〜14:30」→ 日付部分と時刻部分に分ける(文言はそのまま・見せ方だけ変える)
function splitDate(s) {
  const m = String(s).match(/^(\S+)\s+(.+)$/);
  return m ? { d: m[1], t: m[2] } : { d: String(s), t: '' };
}

// --- 可変レイアウト -------------------------------------------------------
// 台帳の文章は長さがまちまちなので、文字量から必要な高さを見積もり、
// 白い面の高さ(=写真の高さ)と文字サイズを決める。長文でも下が切れないように。
const PAD_X = 64, CW = 1080 - PAD_X * 2;   // 文字組みの幅
const emWidth = (s) => [...String(s)].reduce((n, ch) => n + (/[\x20-\x7E｡-ﾟ]/.test(ch) ? 0.54 : 1), 0);
const lineCount = (s, fs, avail = CW) => Math.max(1, Math.ceil((emWidth(s) * fs) / avail - 0.02));

function layout(c) {
  const dt = splitDate(c.date);
  const hasDate = c.date && c.date !== '-';
  const hasPlace = c.place && c.place !== '-';
  const hasNote = c.note && c.note !== '-';
  const FOOT = 110, GAP_BOTTOM = 48, PAD_TOP = 50;
  let best = null;
  for (const s of [1, .94, .88, .82, .76, .70]) {
    const f = {
      title: Math.round(titleSize(c.title) * s), date: Math.round(52 * s), time: Math.round(36 * s),
      place: Math.round(36 * s), note: Math.round(35 * s),
    };
    // 日付+時刻が1行に収まらなければ時刻を次の行へ
    const whenOneLine = emWidth(dt.d) * f.date + 18 + emWidth(dt.t) * f.time <= CW;
    const whenH = hasDate ? (whenOneLine ? f.date * 1.2 : f.date * 1.2 + f.time * 1.45) : 0;
    const titleH = lineCount(c.title, f.title) * f.title * 1.2;
    const placeH = hasPlace ? 24 + lineCount(c.place, f.place, CW - 46) * f.place * 1.4 : 0;
    const noteH = hasNote ? 34 + lineCount(c.note, f.note, CW - 98) * f.note * 1.6 + 60 : 0;
    const sheet = PAD_TOP + whenH + (hasDate ? 14 : 0) + titleH + placeH + noteH + GAP_BOTTOM + FOOT;
    best = { f, whenOneLine, sheet: Math.round(sheet) };
    if (sheet <= 880) break;
  }
  best.sheet = Math.min(Math.max(best.sheet, 470), 900);
  best.hero = 1350 - best.sheet + 62;   // 白い面の角丸ぶん写真を重ねる
  best.padBottom = FOOT + 20;
  return best;
}

const PIN = `<svg class="ico" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="#2C7C9E" d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>`;

const html = (c, photo) => {
  const dt = splitDate(c.date);
  const L = layout(c);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;}
body{font-family:"Noto Sans CJK JP","IPAPGothic","IPAGothic","Noto Color Emoji",sans-serif;-webkit-font-smoothing:antialiased;
  background:#FBFAF5;color:#22323B;position:relative;overflow:hidden;}
.hero{position:absolute;top:0;left:0;width:1080px;height:${L.hero}px;
  ${photo ? `background-image:linear-gradient(180deg,rgba(18,42,55,.55) 0%,rgba(18,42,55,.10) 44%,rgba(18,42,55,.28) 100%),url('file://${photo}');`
          : `background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 26px,rgba(255,255,255,0) 26px 52px),linear-gradient(160deg,#57ACCB,#2C7C9E);`}
  background-size:cover;background-position:center 72%;}
.brand{position:absolute;top:48px;left:64px;color:#fff;font-size:38px;font-weight:800;letter-spacing:1px;text-shadow:0 2px 16px rgba(0,0,0,.5);}
.brand .eb{display:block;font-style:italic;font-size:22px;color:#FFD9A3;font-weight:700;letter-spacing:1.5px;margin-bottom:2px;}
.chip{position:absolute;top:54px;right:64px;font-size:29px;font-weight:800;color:#1F6B8C;background:#fff;border-radius:999px;padding:13px 34px;box-shadow:0 8px 22px rgba(0,0,0,.22);}
.sheet{position:absolute;left:0;right:0;bottom:0;height:${L.sheet}px;background:#FBFAF5;border-radius:56px 56px 0 0;
  padding:50px 64px ${L.padBottom}px;display:flex;flex-direction:column;overflow:hidden;
  box-shadow:0 -16px 44px rgba(18,42,55,.16);}
.when{display:flex;align-items:baseline;gap:18px;color:#2C7C9E;${L.whenOneLine ? '' : 'flex-wrap:wrap;'}}
.when .d{font-size:${L.f.date}px;font-weight:800;letter-spacing:.5px;}
.when .t{font-size:${L.f.time}px;font-weight:700;letter-spacing:.5px;color:#4E7E96;}
.title{margin-top:14px;overflow-wrap:anywhere;font-size:${L.f.title}px;font-weight:800;line-height:1.2;letter-spacing:.5px;color:#1B2A33;}
.place{display:flex;align-items:flex-start;overflow-wrap:anywhere;gap:12px;margin-top:24px;font-size:${L.f.place}px;line-height:1.4;color:#41545E;font-weight:600;}
.place .ico{flex:none;position:relative;top:${Math.round(L.f.place * 0.18)}px;}
.note{margin-top:34px;overflow-wrap:anywhere;font-size:${L.f.note}px;line-height:1.6;color:#3B4C55;background:#F2EEE3;border-left:10px solid #F0B95E;border-radius:10px 24px 24px 10px;padding:30px 32px 30px 28px;}
.foot{position:absolute;left:0;right:0;bottom:0;height:110px;background:#22323B;padding:0 64px;
  display:flex;justify-content:space-between;align-items:center;font-size:28px;color:#C9D4DA;letter-spacing:.5px;}
.foot .hp{font-weight:800;color:#FFD9A3;}
</style></head><body>
  <div class="hero"></div>
  <div class="brand"><span class="eb">Bon Voyage,</span>ぼんぼやーじゅ通信</div>
  ${c.tag && c.tag !== '-' ? `<div class="chip">${esc(c.tag)}</div>` : ''}
  <div class="sheet">
    ${c.date && c.date !== '-' ? `<div class="when"><span class="d">${esc(dt.d)}</span>${dt.t ? `<span class="t">${esc(dt.t)}</span>` : ''}</div>` : ''}
    <div class="title">${esc(c.title)}</div>
    ${c.place && c.place !== '-' ? `<div class="place">${PIN}<span>${esc(c.place)}</span></div>` : ''}
    ${c.note && c.note !== '-' ? `<div class="note">${esc(c.note)}</div>` : ''}
    <div class="foot"><span>@bonvoya_tokyo</span><span class="hp">bonvoya.nicomaru.tokyo</span></div>
  </div>
</body></html>`;
};

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

// --- PNGの下端を切り落として厳密に 1080×1350 にする -----------------------
// ヘッドレスChromeは --window-size の一部を窓枠に使うため、実ビューポートが
// 指定より約90px低くなる。少し高く撮ってから下を捨てることで、カード下端
// (フッター帯など)が欠けるのを防ぐ。うまくいかない環境では撮ったままを使う。
function cropPngTop(buf, targetH) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNGではない');
  const chunks = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    chunks.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  const ihdr = chunks.find(c => c.type === 'IHDR');
  const width = ihdr.data.readUInt32BE(0), height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8], color = ihdr.data[9], interlace = ihdr.data[12];
  if (height === targetH) return buf;
  if (height < targetH) throw new Error(`高さ不足 ${height}`);
  if (depth !== 8 || interlace !== 0) throw new Error('未対応のPNG形式');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) throw new Error('未対応のカラータイプ');
  const stride = 1 + width * ch;
  const raw = inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data)));
  if (raw.length < stride * targetH) throw new Error('データ不足');
  const newIhdr = Buffer.from(ihdr.data);
  newIhdr.writeUInt32BE(targetH, 4);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  return Buffer.concat([buf.subarray(0, 8), chunk('IHDR', newIhdr),
    chunk('IDAT', deflateSync(raw.subarray(0, stride * targetH), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUTDIR, { recursive: true });
const SHOT = `/tmp/ig-shot-${DATE}.png`;
try {
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb', `--window-size=${W},${H + SHOT_PAD}`, `--screenshot=${SHOT}`, `file://${TMP}`],
    { stdio: 'ignore' });
  try {
    writeFileSync(OUT, cropPngTop(readFileSync(SHOT), H));
  } catch (e) {
    console.warn('PNGの切り出しに失敗したので撮ったままを使います:', e.message);
    copyFileSync(SHOT, OUT);
  }
  try { unlinkSync(SHOT); } catch {}
  console.log('画像を作成:', OUT, '| カテゴリ:', cat, '| 写真:', photo || '(なし)');
} catch (e) {
  console.warn('画像生成に失敗（草案は有効）:', e.message);
}
