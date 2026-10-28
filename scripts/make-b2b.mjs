#!/usr/bin/env node
/*
 * 名入れの原稿・住まいパック（ニコマルの事業）の見本を作る。
 *   node scripts/make-b2b.mjs            … いちばん新しい月の見本
 *   node scripts/make-b2b.mjs 2026-11    … 月を指定
 *
 * 入力:
 *   docs/b2b/specs/<月>.json            … 載せる催しとひとこと（毎月の目通しで決める。日時・場所・料金は台帳から写す）
 *   docs/homepage/data/events-public.json … 年齢の目安と公式URL（ここに無い催しは載せない）
 *   data/b2b-places.json                 … 物件シートに出す施設（市・都の公式で住所を確かめたものだけ）
 * 出力（docs/b2b/sample/。公開しない＝docs/homepage の外）:
 *   odekake-<月>.html/.pdf   … 来月の子連れおでかけ（A4・名入れ）
 *   kankyo-<月>.html/.pdf    … 子育て施設と今月の催し（物件ごと・A4）
 *   line-<月>.txt            … お店のLINE・メールに貼る文
 *   moushikomi-nicomaru.html/.pdf … 申込書（ニコマル名義）
 *
 * ★2026-10-28 オーナー決定（docs/revenue-ideas.md §3「やる」B）。ルールは docs/b2b/README.md。
 * 🔒 紙面に作り方・道具・台帳のことを書かない。距離は「直線距離の目安」。「子育てしやすい」のような評価の言葉は書かない。
 * 🔴 書体: 先に `bash scripts/setup-fonts.sh`（Zen Maru Gothic・Noto Sans JP）。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { esc } from './lib/gate.mjs';

const SPEC_DIR = 'docs/b2b/specs';
const OUT = 'docs/b2b/sample';
const month = process.argv[2] || readdirSync(SPEC_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().pop().slice(0, 7);
const spec = JSON.parse(readFileSync(`${SPEC_DIR}/${month}.json`, 'utf8'));
const pub = JSON.parse(readFileSync('docs/homepage/data/events-public.json', 'utf8'));
const byId = new Map(pub.events.map((e) => [e.id, e]));
const places = JSON.parse(readFileSync('data/b2b-places.json', 'utf8'));
const [Y, M] = month.split('-').map(Number);

// --- 載せてはいけない催し ---
// 主催者とのやりとりで「通信への掲載」として許しをもらった催し・チラシを直接もらった催しは、名入れの原稿に入れない
// （許しの範囲は通信まで。お店の配る紙に広げない）。docs/b2b/README.md
const PERMISSION_ONLY = new Set(['E118', 'E119', 'E126', 'E130', 'E142', 'E187']);
// 協賛（PR）の催しも入れない。号の web の item に "pr" が付いたもの
const PR_IDS = new Set();
if (existsSync('reports/free/web'))
  for (const f of readdirSync('reports/free/web').filter((f) => f.endsWith('.json'))) {
    const w = JSON.parse(readFileSync(`reports/free/web/${f}`, 'utf8'));
    for (const it of [...(w.items || []), ...(w.ahead || [])]) if (it.pr !== undefined) PR_IDS.add(it.id);
  }
const LEAK = /\bE\d{2,3}\b|台帳|巡回|スクリプト|Routine|Claude|GoatCounter|\/f\/|\.md\b|\.json\b|裏取り|確度/;
const EVAL = /子育てしやすい|住みやすい|閑静|安心|安全な|便利|人気の|おすすめ|最適|ぴったり/;

const problems = [];
const check = (id, texts) => {
  const ev = byId.get(id);
  if (!ev) problems.push(`${id}: 公開データに無い（見送り・保留か、日付が取れていない）`);
  else {
    if (!ev.url) problems.push(`${id}: 公式のURLが無い。名入れの原稿には公式に公開された催しだけ`);
    if (ev.tentative) problems.push(`${id}: 日程が仮`);
  }
  if (PERMISSION_ONLY.has(id)) problems.push(`${id}: 主催者の許しが通信までの催し。名入れの原稿に入れない`);
  if (PR_IDS.has(id)) problems.push(`${id}: 協賛（PR）の催し。名入れの原稿に入れない`);
  for (const t of texts) {
    if (t && LEAK.test(t)) problems.push(`${id}: 内部の話が入っている: ${t}`);
    if (t && EVAL.test(t)) problems.push(`${id}: 評価の言葉が入っている: ${t}`);
  }
  return ev;
};
const items = spec.items.map((it) => ({ it, ev: check(it.id, [it.note, it.place, it.cost]) }));
const near = spec.near.map((it) => ({ it, ev: check(it.id, [it.text]) }));
for (const id of spec.line) if (!spec.items.some((it) => it.id === id)) problems.push(`${id}: LINE用に選んだが、items に無い`);
for (const p of places.places) if (EVAL.test(p.note)) problems.push(`${p.name}: 評価の言葉が入っている: ${p.note}`);
if (problems.length) {
  console.error('🔴 作れない:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// --- 共通の部品 ---
const AGE = [['baby', '👶', 'あかちゃん'], ['pre', '🧒', '未就学'], ['elem', '🎒', '小学生']];
const ages = (ev) =>
  AGE.filter(([k]) => ['◎', '○'].includes((ev.ages || {})[k])).map(([k, icon, label]) => `<span class="age ${ev.ages[k] === '◎' ? 'best' : ''}">${icon}${label}${ev.ages[k]}</span>`).join('');
const qr = readFileSync(`${OUT}/qr-site.svg`, 'utf8').replace(/<\?xml[^>]*\?>/, '').replace(/width="[^"]*" height="[^"]*"/, 'width="100%" height="100%"');
// 確かめた日（spec の checked＝催し、b2b-places の checked＝施設）。号の月ではなく、公式を見た日を書く
const ymd = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}年${m}月${dd}日`; };
const CHECKED = ymd(spec.checked);
const PLACES_CHECKED = ymd(places.checked);
const CSS = `
  @page { size: 210mm 297mm; margin: 0; }
  :root { --ink:#2E3A42; --soft:#56636B; --faint:#7F8A91; --line:#E4DED2; --wash:#F6F3EC;
          --sky:#2C7C9E; --sky-ink:#226881; --sky-wash:#E8F3F7; --mari:#E3962F; --mari-ink:#8A5A12; --mari-wash:#FBF0DE;
          --terra:#C9755B; --terra-ink:#A04F37; --terra-wash:#FBEDE6; --leaf:#5E9A5B; --leaf-wash:#EAF2E7; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body { font-family: "Noto Sans JP", "Zen Kaku Gothic New", sans-serif; color: var(--ink); font-size: 8.8pt; line-height: 1.6;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .maru { font-family: "Zen Maru Gothic", sans-serif; }
  .sheet { width: 210mm; height: 297mm; padding: 11mm 12mm 0; position: relative; overflow: hidden; }
  .sample { position: absolute; top: 5mm; right: 12mm; font-size: 7pt; color: var(--terra-ink); border: .3mm solid var(--terra); border-radius: 1mm; padding: .3mm 1.6mm; letter-spacing: .1em; }
  .foot { position: absolute; left: 12mm; right: 12mm; bottom: 7mm; font-size: 6.6pt; color: var(--faint); border-top: .25mm solid var(--line); padding-top: 1.6mm; display: flex; justify-content: space-between; gap: 4mm; }
  .foot span:last-child { flex: none; white-space: nowrap; }
  .emoji { font-family: "Noto Color Emoji", sans-serif; }
  .age { display: inline-block; font-size: 7.4pt; color: var(--soft); background: var(--wash); border-radius: 1mm; padding: 0 1.4mm; margin: .6mm 1mm 0 0; }
  .age.best { color: var(--leaf); background: var(--leaf-wash); font-weight: 700; }
`;

// 名入れのヘッダー（見本は「〇〇」）
const client = esc(spec.client || '〇〇');

// ========== ① 来月の子連れおでかけ（A4） ==========
const cards = items.map(({ it, ev }) => `
    <article class="card">
      <div class="when maru"><b>${esc(it.date)}</b>${it.time ? `<span>${esc(it.time)}</span>` : ''}</div>
      <h3 class="maru">${esc(ev.name.replace(/（[^）]*）$/, ''))}</h3>
      <p class="where">📍 ${esc(it.place)}${it.cost ? `　<span class="cost">${esc(it.cost)}</span>` : ''}</p>
      <p class="note">${esc(it.note)}</p>
      <div class="ages">${ages(ev)}</div>
    </article>`).join('');
const odekake = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${M}月の子連れおでかけ（見本）</title>
<style>${CSS}
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: .6mm solid var(--mari); padding-bottom: 2.4mm; }
  .head h1 { font-size: 21pt; line-height: 1.2; letter-spacing: .02em; }
  .head h1 small { display: block; font-size: 9.5pt; color: var(--soft); font-weight: 500; letter-spacing: 0; margin-top: 1mm; }
  .head .from { text-align: right; font-size: 8pt; color: var(--soft); }
  .head .from b { display: block; font-size: 13pt; color: var(--ink); }
  .lead { margin: 3mm 0 3.4mm; font-size: 8.8pt; color: var(--soft); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .card { border: .3mm solid var(--line); border-radius: 2mm; padding: 2.6mm 3mm 2.4mm; background: #fff; break-inside: avoid; }
  .card .when { color: var(--sky-ink); font-size: 8.4pt; }
  .card .when b { font-size: 9.6pt; margin-right: 1.6mm; }
  .card h3 { font-size: 10.4pt; line-height: 1.38; margin: .6mm 0 .8mm; }
  .card .where { font-size: 7.8pt; color: var(--soft); }
  .card .cost { color: var(--mari-ink); }
  .card .note { font-size: 8.2pt; margin-top: .6mm; }
  .shop { margin-top: 3.4mm; border: .4mm dashed var(--mari); border-radius: 2mm; padding: 2.6mm 3.4mm; background: var(--mari-wash); min-height: 21mm; }
  .shop b { font-size: 8pt; color: var(--mari-ink); }
  .shop p { font-size: 8.4pt; color: var(--soft); margin-top: .6mm; }
  .src { display: flex; gap: 4mm; align-items: center; margin-top: 3.2mm; }
  .src .qr { width: 23mm; height: 23mm; flex: none; }
  .src p { font-size: 7.6pt; color: var(--soft); }
  .src p b { color: var(--ink); font-size: 8.6pt; }
</style></head><body>
<section class="sheet">
  <span class="sample">見本</span>
  <div class="head">
    <h1 class="maru">${M}月の子連れおでかけ<small>${esc(spec.station)}から30分くらいで行ける、${M}月の催し</small></h1>
    <div class="from">お届け<b class="maru">${client}</b></div>
  </div>
  <p class="lead">赤ちゃん・未就学・小学生のいるご家庭へ。市や施設の公式に出ている催しを、日付の順に並べました。年齢の目安は ◎ぴったり ○だいじょうぶ。</p>
  <div class="grid">${cards}
  </div>
  <div class="shop"><b>${client}より（このわくは、お店のひとこと・連絡先を入れる場所です）</b><p>例）寒くなってきました。お出かけの帰りに、お気軽にお立ち寄りください。</p></div>
  <div class="src">
    <div class="qr">${qr}</div>
    <p><b>情報：ぼんぼやーじゅ通信</b><br>小平の子育て家庭に、週末のおでかけ情報を毎週お届けしている無料の通信です。QRから、ほかの催しやおでかけカレンダーも見られます。</p>
  </div>
  <div class="foot"><span>催しは主催者の公式の情報をもとにしています（${CHECKED}時点）。中止・変更があります。お出かけ前に公式でご確認ください。主催者・施設が、このお知らせを推薦・後援するものではありません。</span><span>作成：ニコマル</span></div>
</section>
</body></html>`;

// ========== ② 子育て施設と今月の催し（物件ごと） ==========
const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const dir = (a, b) => {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return DIRS[Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) / 45) % 8];
};
const fmtDist = (m) => (m < 1000 ? `約${Math.max(50, Math.round(m / 50) * 50)}m` : `約${(Math.round(m / 100) / 10).toFixed(1)}km`);
const rows = places.places
  .map((p) => ({ p, m: dist(spec.point, p) }))
  .sort((a, b) => a.m - b.m)
  .map(({ p, m }) => `
      <tr><td class="kind">${esc(p.kind)}</td><td><b>${esc(p.name)}</b><br><span class="addr">${esc(p.addr)}</span></td>
          <td class="dist maru">${fmtDist(m)}<small>${dir(spec.point, p)}</small></td><td class="pn">${esc(p.note)}</td></tr>`).join('');
const nearRows = near.map(({ it }) => `<li><b class="maru">${esc(it.date)}</b>${esc(it.text)}</li>`).join('');
const kankyo = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>まわりの子育て施設と今月の催し（見本）</title>
<style>${CSS}
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: .6mm solid var(--sky); padding-bottom: 2.4mm; }
  .head h1 { font-size: 18pt; line-height: 1.25; }
  .head h1 small { display: block; font-size: 9pt; color: var(--soft); font-weight: 500; margin-top: 1mm; }
  .head .from { text-align: right; font-size: 8pt; color: var(--soft); }
  .head .from b { display: block; font-size: 13pt; color: var(--ink); }
  .point { margin: 3.4mm 0 2.6mm; background: var(--sky-wash); border-radius: 2mm; padding: 2.4mm 3.4mm; font-size: 9pt; }
  .point b { font-size: 10.5pt; }
  h2 { font-size: 11pt; margin: 4.4mm 0 1.8mm; color: var(--sky-ink); }
  table { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
  th { text-align: left; font-weight: 500; font-size: 7.4pt; color: var(--faint); border-bottom: .3mm solid var(--line); padding: 1mm 1.6mm; }
  td { border-bottom: .25mm solid var(--line); padding: 2mm 1.6mm; vertical-align: top; }
  td.kind { width: 21mm; color: var(--soft); font-size: 8pt; }
  td .addr { font-size: 7.6pt; color: var(--faint); }
  td.dist { width: 24mm; font-size: 10pt; color: var(--sky-ink); white-space: nowrap; }
  td.dist small { display: block; font-size: 7.4pt; color: var(--soft); font-family: "Noto Sans JP", sans-serif; }
  td.pn { font-size: 8pt; color: var(--soft); }
  ul.ev { list-style: none; }
  ul.ev li { padding: 1.8mm 0; border-bottom: .25mm solid var(--line); font-size: 8.8pt; }
  ul.ev li b { display: inline-block; min-width: 46mm; color: var(--mari-ink); font-size: 8.8pt; }
  .notes { margin-top: 4mm; font-size: 7.6pt; color: var(--soft); background: var(--wash); border-radius: 2mm; padding: 2.4mm 3.4mm; }
  .notes li { margin-left: 4mm; }
  .src { display: flex; gap: 4mm; align-items: center; margin-top: 3.4mm; }
  .src .qr { width: 21mm; height: 21mm; flex: none; }
  .src p { font-size: 7.6pt; color: var(--soft); }
  .src p b { color: var(--ink); font-size: 8.6pt; }
</style></head><body>
<section class="sheet">
  <span class="sample">見本</span>
  <div class="head">
    <h1 class="maru">まわりの子育て施設と、今月の催し<small>公園・児童館・図書館と、${M}月に近くで開かれる催し</small></h1>
    <div class="from">お届け<b class="maru">${client}</b></div>
  </div>
  <div class="point">基準の地点：<b>${esc(spec.point.label)}</b>　<span style="color:var(--faint)">（見本のため駅を基準にしています。実際は物件の住所を基準にお作りします）</span></div>

  <h2 class="maru">近くの施設（直線距離の目安の近い順）</h2>
  <table><thead><tr><th>種類</th><th>施設</th><th>直線距離・方角</th><th>ひとこと</th></tr></thead><tbody>${rows}
  </tbody></table>

  <h2 class="maru">${M}月、近くで開かれる催し</h2>
  <ul class="ev">${nearRows}</ul>

  <div class="notes"><ul>
    <li>距離は、地図の上の<b>直線距離の目安</b>です（住所の代表の地点どうし）。道のりや、歩いてかかる時間ではありません。</li>
    <li>施設の情報は、市・都の公式のページで確かめたものです（${PLACES_CHECKED}時点）。開館日・時間は、お出かけ前に公式でご確認ください。</li>
    <li>催しは主催者の公式の情報をもとにしています。中止・変更があります。</li>
    <li>この資料は、地域や物件を評価するものではありません。</li>
  </ul></div>
  <div class="src">
    <div class="qr">${qr}</div>
    <p><b>情報：ぼんぼやーじゅ通信</b><br>小平の子育て家庭に、週末のおでかけ情報を毎週お届けしている無料の通信です。</p>
  </div>
  <div class="foot"><span>施設は住所の公開されている公共の施設だけを載せています。</span><span>作成：ニコマル</span></div>
</section>
</body></html>`;

// ========== ③ お店のLINE・メールに貼る文 ==========
// 🔴 お店のLINEに載せる文に、通信の宣伝（友だち追加のお願い・URL）は入れない。出典として名前だけ（docs/b2b/README.md）
const lineItems = spec.line.map((id) => spec.items.find((it) => it.id === id)).map((it) => {
  const ev = byId.get(it.id);
  return `・${it.date}${it.time ? ' ' + it.time : ''}\n　${ev.name.replace(/（[^）]*）$/, '')}\n　${it.note}`;
});
const lineText = `【${M}月の子連れおでかけ】
${spec.client}より、${spec.station}から30分くらいで行ける、${M}月の催しです。

${lineItems.join('\n\n')}

お出かけ前に、主催者の公式のページで最新の情報をご確認ください。
（情報：ぼんぼやーじゅ通信）
`;

// ========== ④ 申込書（ニコマル名義） ==========
const moushikomi = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>お申込書（見本）｜ニコマル</title>
<style>${CSS}
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: .6mm solid var(--ink); padding-bottom: 2mm; }
  .head h1 { font-size: 15.5pt; }
  .head .to { font-size: 8.4pt; color: var(--soft); text-align: right; }
  .head .to b { font-size: 11pt; color: var(--ink); }
  h2 { font-size: 10pt; margin: 3.6mm 0 1.4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
  th, td { border: .25mm solid #BFB7A6; padding: 1.6mm 2.2mm; vertical-align: top; text-align: left; }
  th { background: var(--wash); font-weight: 500; width: 34mm; }
  .plans th { width: auto; }
  .plans td:first-child { width: 31mm; white-space: nowrap; }
  .plans td.p { white-space: nowrap; font-size: 10pt; font-weight: 700; }
  .box { display: inline-block; width: 3.4mm; height: 3.4mm; border: .3mm solid var(--ink); vertical-align: -.5mm; margin-right: 1.2mm; }
  .fill td { height: 8.4mm; }
  ol.terms { margin: 0 0 0 4.6mm; font-size: 7.7pt; color: var(--soft); line-height: 1.55; }
  ol.terms li { margin: .5mm 0; }
  ol.terms b { color: var(--ink); }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3.4mm; font-size: 8.4pt; }
  .sign div { border-bottom: .3mm solid var(--ink); padding-bottom: 6mm; }
</style></head><body>
<section class="sheet">
  <span class="sample">見本</span>
  <div class="head">
    <h1 class="maru">「来月の子連れおでかけ」原稿・住まいパック　お申込書</h1>
    <div class="to">お申込日　　　年　　月　　日<br><b class="maru">ニコマル</b> 行</div>
  </div>

  <h2 class="maru">プラン（原稿プランか住まいパックのどちらかに印を。名前なしは追加で）</h2>
  <table class="plans">
    <tr><th>プラン</th><th>中身</th><th>月額</th></tr>
    <tr><td><span class="box"></span><b>原稿プラン</b></td><td>毎月の「来月の子連れおでかけ」（A4・お店の名前入り・PDF）と、お店のLINE・メールに貼る文。<br><b>1業種 × 1つの駅のまわりで1社だけ</b></td><td class="p">4,000円</td></tr>
    <tr><td><span class="box"></span><b>住まいパック</b></td><td>原稿プランに加えて、物件の住所ごとの「まわりの子育て施設と今月の催し」（月5件まで）と、季節の名入れガイド（年2回）。<br><b>1つの駅のまわりで1社だけ</b></td><td class="p">8,000円</td></tr>
    <tr><td><span class="box"></span>名前なし</td><td>通信の名前とQRコードを入れない形（標準は入れます）</td><td class="p">＋2,000円</td></tr>
  </table>

  <h2 class="maru">お申込者</h2>
  <table class="fill">
    <tr><th>会社・お店の名前</th><td></td></tr>
    <tr><th>原稿に入れるお名前</th><td></td></tr>
    <tr><th>ご担当者</th><td></td></tr>
    <tr><th>ご住所</th><td></td></tr>
    <tr><th>お電話・メール</th><td></td></tr>
    <tr><th>対象の駅（1つ）</th><td></td></tr>
    <tr><th>はじめる月</th><td>　　　　年　　月分から（3か月から。そのあとは1か月ごと）</td></tr>
  </table>

  <h2 class="maru">お約束（お申し込みの前にお読みください）</h2>
  <ol class="terms">
    <li><b>お支払い</b>：前払いです。毎月、請求書（ニコマル名義）をお送りします。振込手数料はご負担ください。消費税の上乗せはありません（インボイスの登録はしていません）。</li>
    <li><b>お届け</b>：毎月20日ごろに、翌月分をメールでお送りします。物件の資料は、住所をいただいてから3営業日ほどでお送りします。</li>
    <li><b>やめるとき</b>：前の月の10日までにご連絡ください。翌月分から止めます。お届けする前の月の分は、全額お返しします。</li>
    <li><b>載せる催し</b>：市や施設、主催者の公式に出ている催しだけを、こちらで選んで載せます。お店の催しや商品の宣伝は入れられません（お店のひとことは、専用のわくにお店で書いていただけます）。</li>
    <li><b>距離</b>：地図の上の直線距離の目安です。道のりや所要時間ではありません。「子育てしやすい」のような評価の言葉は書きません。物件の広告にお使いになるときは、不動産の表示のきまりに沿ってお使いください。</li>
    <li><b>中止・変更</b>：催しは主催者の都合で中止・変更になることがあります。主催者・施設が、この原稿を推薦・後援するものではありません。</li>
    <li><b>使える範囲</b>：お客さまへの配布（紙・メール・お店のLINE・お店のホームページ）にお使いいただけます。ほかの事業者への配布や販売はできません。</li>
    <li><b>個人の情報</b>：お客さまの個人の情報はいただきません。原稿を受け取って使うだけの形です。</li>
  </ol>

  <div class="sign"><div>お申込者のお名前（ご署名）</div><div>受付（ニコマル）</div></div>
  <div class="foot"><span>お問い合わせ：tokyo.papa.home@gmail.com（請求書の発行：ニコマル）</span><span>${spec.checked.slice(0, 4)}年${Number(spec.checked.slice(5, 7))}月版</span></div>
</section>
</body></html>`;

// --- 書き出し ---
mkdirSync(OUT, { recursive: true });
const files = { [`odekake-${month}`]: odekake, [`kankyo-${month}`]: kankyo, 'moushikomi-nicomaru': moushikomi };
for (const [name, html] of Object.entries(files)) writeFileSync(`${OUT}/${name}.html`, html);
writeFileSync(`${OUT}/line-${month}.txt`, lineText);

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const browser = await chromium.launch();
for (const name of Object.keys(files)) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(`${process.cwd()}/${OUT}/${name}.html`).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // はみ出しの検査: 中身の下端がフッターにかからないこと
  const over = await page.evaluate(() => {
    const s = document.querySelector('.sheet'), f = s.querySelector('.foot');
    const limit = f.getBoundingClientRect().top - 1.5 * 96 / 25.4;
    let bottom = 0;
    for (const el of s.children) if (el !== f && !el.classList.contains('sample')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    return bottom > limit ? ((bottom - limit) * 25.4 / 96).toFixed(1) : null;
  });
  if (over) console.error(`  🔴 ${name}: フッターに ${over}mm かかっている`);
  await page.pdf({ path: `${OUT}/${name}.pdf`, preferCSSPageSize: true, printBackground: true });
  await page.close();
  console.log(`  ${OUT}/${name}.pdf${over ? '（はみ出しあり）' : ''}`);
}
await browser.close();
console.log(`  ${OUT}/line-${month}.txt（${lineText.length}文字・${lineText.split('\n').length}行）`);
