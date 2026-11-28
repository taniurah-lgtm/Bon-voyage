#!/usr/bin/env node
/*
 * 小児科の待合室用 小さな情報誌（A5・中綴じ8ページ）の版下を作って、検査する。
 *   node scripts/build-booklet.mjs            # 題名案A（表紙）
 *   node scripts/build-booklet.mjs --title B  # 題名案B
 *
 * 出力: docs/print/booklet/
 *   page-1.html … page-8.html   A5 1ページずつ
 *   spread-4-5.html             中央の見開き（確認用）
 *   imposed.html                面付け済み（A4横・4面。中綴じの順）
 *   booklet-a4-imposed.pdf      ★刷るのはこれ（A4横・両面・短辺とじ）
 *   booklet-a5-pages.pdf        A5 1ページずつ（画面で読む用）
 *   cover-A/B/C.html・png       題名案ごとの表紙
 *   preview/                    見え方の確認（カラー・白黒）
 *
 * 材料: data/teirei.json  data/map-spots.json  data/entei.json(map)  scripts/lib/tilemap.mjs
 *   書いてあるのは「決まった曜日・場所・無料か」だけ。日付のある催しは入れない。
 * ★書体は bash scripts/setup-fonts.sh で入れる。無いと IPAゴシックに落ちる。
 * ★position:absolute は使わない（検査をすり抜けて重なる）。流し込みで組む。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { layoutTiles } from './lib/tilemap.mjs';
import { checkTextOverlap } from './lib/check-layout.mjs';

const OUT = 'docs/print/booklet';
mkdirSync(`${OUT}/preview`, { recursive: true });
const arg = process.argv.indexOf('--title');
const TITLE_KEY = arg > 0 ? process.argv[arg + 1] : 'A';

const TITLES = {
  A: { main: '小平 子育ておでかけ帖', sub: '児童館・こども広場・図書館・公園。小平の「行ける場所」をまとめました' },
  B: { main: 'こだいら ちいさなおでかけ地図', sub: '雨の日も、晴れの日も。子どもと行ける場所を地図つきで' },
  C: { main: '小平 親子の行き先ブック', sub: '無料で行ける屋内の場所と、公園・外あそびのまとめ' },
};

const URL_HOME = 'https://bonvoya.nicomaru.tokyo';
const ISSUE = '2026年11月';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 材料 ───────────────────────────────────────────
const TEIREI = JSON.parse(readFileSync('data/teirei.json', 'utf8'));
const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));
const ENTEI = JSON.parse(readFileSync('data/entei.json', 'utf8')).map;
const spotOf = (p) => (p.spots || []).map((n) => SPOTS.find((x) => x.name === n)).find((x) => x && typeof x.lat === 'number');
const ages = (name) => {
  const s = SPOTS.find((x) => x.name === name);
  if (!s) throw new Error('map-spots に無い: ' + name);
  const m = s.ages.match(/👶\s*(\S+)\s*🧒\s*(\S+)\s*🎒\s*(\S+)/);
  if (!m) throw new Error('年齢の目安が読めない: ' + name);
  return `<span class="ag">赤ちゃん${m[1]}　未就学${m[2]}　小学生${m[3]}</span>`;
};

// ── 種類（色だけに頼らない。形と文字でも分かる）─────────
const KIND = {
  lib: { name: '図書館', ch: '本', cls: 'k-lib' },
  ji: { name: '児童館', ch: '児', cls: 'k-ji' },
  ko: { name: 'こども広場', ch: 'こ', cls: 'k-ko' },
  sh: { name: '出張こども広場', ch: '出', cls: 'k-sh' },
  hi: { name: '子育てひろば', ch: 'ひ', cls: 'k-hi' },
};
const SEC2KIND = { lib: 'lib', jidokan: 'ji', kodomo: 'ko', chiiki: 'sh', hiroba: 'hi' };
const bd = (k) => `<i class="bd ${KIND[k].cls}">${KIND[k].ch}</i>`;

// ── マス目の地図 ─────────────────────────────────────
const MC = 6, MR = 7;
const SCHED = {
  ji: '毎日 9〜14時',
  ko: '月〜土 10〜18時',
  hi: '火〜土 10〜18時',
  lib: 'おはなし会など',
  miyuki: '毎週金曜・第3日曜', gakuenhigashi: '毎週木曜・第2日曜', nakajuku: '毎週水曜・第1日曜',
  misono: '毎週月曜', gakuennishi: '毎週月曜', suzuki: '毎週水曜', ogawahigashi2: '毎週木曜', 'kihei-s': '毎週木曜', 'ogawanishi-s': '毎週金曜',
  sawayaka: '月〜土 10〜17時',
};
const places = [];
for (const sec of TEIREI.sections) for (const p of sec.places) {
  if (!p.tile) continue;
  const sp = spotOf(p);
  if (!sp) throw new Error('地図の位置が無い: ' + p.name);
  places.push({ key: p.key, tile: p.tile, kind: SEC2KIND[sec.key] || 'sh', lat: sp.lat, lng: sp.lng });
}
const nodes = [
  ...places.map((p) => ({ id: p.key, w: 1, lat: p.lat, lon: p.lng, place: p })),
  ...ENTEI.stations.map((st, i) => ({ id: `st${i}`, w: 0.7, lat: st.lat, lon: st.lon, station: st })),
];
const lay = layoutTiles({ cols: MC, rows: MR, bounds: ENTEI.bounds, ys: 0.55, nodes });
if (lay.tooMany) throw new Error('マスが足りない');
if (lay.outside.length) console.warn('外枠の外:', lay.outside.join(','));
const byCell = new Map([...lay.at].map(([id, c]) => [c, nodes.find((n) => n.id === id)]));
const LIBSHORT = { 中央: '中央', 仲町: '仲町', 喜平: '喜平', 花小金井: '花小金井', 上宿: '上宿', 大沼: '大沼', 津田: '津田', 小川西町: '小川西町' };
function cell(n) {
  if (!n) return '<div class="cell empty"></div>';
  if (n.station) return `<div class="cell st"><i class="bd k-st">駅</i><b>${esc(n.station.name)}</b></div>`;
  const p = n.place, k = KIND[p.kind];
  const sched = SCHED[p.key] || SCHED[p.kind] || '';
  const nm = p.kind === 'lib' ? `${LIBSHORT[p.tile]}図書館` : p.tile;
  return `<div class="cell tt ${k.cls}-c">${bd(p.kind)}<span class="ct"><b>${esc(nm)}</b><small>${esc(k.name)}</small><small>${esc(sched)}</small></span></div>`;
}
function mapHalf(side) {
  const cols = side === 'L' ? [0, 1, 2] : [3, 4, 5];
  const cells = [];
  for (let r = 0; r < MR; r++) for (const c of cols) cells.push(cell(byCell.get(r * MC + c)));
  return `<div class="grid">${cells.join('')}</div>`;
}
const legend = `<div class="legend">${Object.keys(KIND).map((k) => `<span>${bd(k)}${esc(KIND[k].name)}</span>`).join('')}<span><i class="bd k-st">駅</i>駅</span></div>`;

// ── 部品 ───────────────────────────────────────────
const foot = (n) => `<footer class="pf">— ${n} —</footer>`;
const rh = (t) => `<header class="rh"><span class="brandmini">ぼんぼやーじゅ通信</span><span>${esc(t)}</span></header>`;
const pageWrap = (n, cls, inner, { running = '', footer = true } = {}) =>
  `<section class="page ${cls}" data-p="${n}">${running ? rh(running) : ''}<div class="main">${inner}</div>${footer ? foot(n) : ''}</section>`;

const qrImg = (mm) => `<img class="qr" src="assets/qr-clinic.svg" alt="LINE友だち追加の入口のQRコード" style="width:${mm}mm;height:${mm}mm">`;

// ── 1 表紙 ──────────────────────────────────────────
const deco = `<svg class="deco" viewBox="0 0 120 34" aria-hidden="true">
  <g fill="none" stroke="#2C7C9E" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 30h108"/>
    <path d="M14 30V19l8-7 8 7v11M19 30v-6h6v6"/>
    <circle cx="48" cy="12" r="6"/><path d="M48 18v5M48 30"/>
    <path d="M64 30V22M60 22h8M62 22l2-6 2 6"/>
    <path d="M84 30V20l7-6 7 6v10M89 30v-5h5v5"/>
    <circle cx="108" cy="9" r="4"/><path d="M108 13v4"/>
    <path d="M36 30l5-9 5 9M44 30l5-7 5 7"/>
  </g></svg>`;
function cover(tk) {
  const t = TITLES[tk];
  return pageWrap(1, 'cover', `
    <div class="addr">小平市の、赤ちゃん・未就学児・小学生のいるご家庭へ</div>
    <div class="brandline">ぼんぼやーじゅ通信 がつくりました</div>
    <h1 class="ttl thick2">${esc(t.main)}</h1>
    <p class="sub">${esc(t.sub)}</p>
    ${deco}
    <div class="qrbox">
      <div class="qrcap1 thick">LINEで、毎週の おでかけ情報を</div>
      ${qrImg(56)}
      <div class="qrcap2">スマホのカメラで読み取ってください</div>
    </div>
    <p class="promise"><b>毎週水曜の朝に、週末のおでかけ情報が届きます。</b><br>無料・友だち追加だけ・お名前などの入力はいりません。</p>
    <p class="step">読み取ると、ホームページが開きます。「LINEで友だち追加（無料）」のボタンを押してください。</p>
  `, { footer: false });
}

// ── 2 雨の日の無料の屋内 ① ─────────────────────────────
const p2 = pageWrap(2, 'p2', `
  <h2 class="h thick2">雨の日・寒い日に行ける、無料の屋内 ①</h2>
  <p class="lead">予約なしで入れる、乳幼児親子のひろばです。どれも無料。</p>

  <section class="blk">
    <h3>${bd('ji')}児童館（市内に3館）</h3>
    <p class="big">乳幼児と保護者の「こども広場」は、毎日 <b>9:00〜14:00</b>（予約なし）。</p>
    <table class="tb ji">
      <tr><th>花小金井南児童館（はなみん）</th><td>9:00〜19:00（日曜は18:00まで）</td></tr>
      <tr><th>小川町二丁目児童館（おがにん）</th><td>月〜土 9:00〜19:00／日・祝 9:00〜18:00</td></tr>
      <tr><th>小川町一丁目児童館（おがいち）</th><td>月〜土 9:00〜19:00／日・祝 9:00〜18:00</td></tr>
    </table>
    <ul class="ul">
      <li>乳幼児・小学生は18時まで。<b>休館は第1・第3火曜</b>（祝日のときは翌日）と年末年始。</li>
      <li>12:00〜13:00はお昼の時間。花小金井南児童館は、持ってきたお弁当を館内で食べられます（ごみは持ち帰り）。</li>
      <li>小川町二丁目児童館は、はじめての日に利用登録をします。</li>
      <li>月ごとの催し（乳幼児親子クラスなど）は、各館の「だより」に出ます。</li>
    </ul>
  </section>

  <section class="blk">
    <h3>${bd('ko')}こども広場（地域センター・6か所）</h3>
    <p class="big"><b>月〜土曜 10:00〜18:00</b>（予約なし）。乳幼児と保護者・小中学生。</p>
    <p class="plain">中島／上水本町／小川東町／天神／大沼の各地域センターと、さわやか館（花小金井・<b>10:00〜17:00</b>）。子育ての相談ができる「子育てコンシェルジュ」がいます。祝日・年末年始は、施設の案内でご確認ください。</p>
  </section>

  <section class="blk">
    <h3>${bd('hi')}子育て交流ひろば「おひさま」</h3>
    <p class="plain">子ども家庭支援センター（小平元気村おがわ東 2階・西武拝島線 萩山駅から徒歩約5分）。<b>火〜土 10:00〜18:00</b>（日・月・祝・年末年始は休み）。市外の方も使えます。11:30〜13:00は昼食が食べられます（12:40までに入室）。毎日11時15分ごろから、手遊びや絵本のお楽しみタイム。月ごとのプログラムは「子ども家庭支援センターだより」に出ます。</p>
  </section>
`, { running: '雨の日・寒い日に行ける、無料の屋内' });

// ── 3 図書館・出張こども広場 ────────────────────────────
const LIB = [
  ['中央図書館', '第1火曜 11:00〜11:20（祝日の月は第2火曜）', '第1・3・4火曜 15:30〜16:00／第2土曜 14:00〜14:30', ''],
  ['仲町図書館（なかまちテラス）', '第1木曜 11:00〜11:20', '第2・第3日曜 11:00〜11:30', ''],
  ['喜平図書館', '第2水曜 11:00〜11:20', '第2水曜・第4木曜 15:30〜16:00', ''],
  ['花小金井図書館', '第1木曜ごろ 11:00〜（予約が必要。会場は東部市民センター）', '第1・3水曜 15:30〜（予約が必要）', ''],
  ['上宿図書館', '第4水曜 11:00〜11:20', '第2木曜・第4水曜 15:30〜16:00（予約。当日の申込みも可）', ''],
  ['大沼図書館', '第2水曜 11:00〜11:20', '第2水曜・第4木曜 16:00〜16:30', ''],
  ['津田図書館', '第3水曜 11:00〜11:20', '第1日曜 11:00〜11:30／第3水曜 15:30〜16:00', ''],
];
const libRows = LIB.map(([n, a, b, note]) => `<tr><th>${esc(n)}</th><td>${esc(a)}</td><td>${esc(b)}</td></tr>${note ? `<tr class="nt"><td colspan="3">▲ ${esc(note)}</td></tr>` : ''}`).join('');
const p3 = pageWrap(3, 'p3', `
  <h2 class="h thick2">雨の日・寒い日に行ける、無料の屋内 ②</h2>
  <section class="blk">
    <h3>${bd('lib')}図書館の「絵本のへや」と「おはなし会」</h3>
    <p class="plain"><b>絵本のへや＝0〜3歳と保護者</b>／<b>おはなし会＝4歳〜小学生</b>。どちらも無料。決まった曜日にくり返し開かれます。途中からは入れないので、始まる前に。</p>
    <table class="tb lib">
      <tr class="hd"><th>市立図書館</th><td>絵本のへや（毎月）</td><td>おはなし会（毎月）</td></tr>
      ${libRows}
    </table>
    <p class="note">月や祝日で日にちが変わることがあります。行く前に、図書館の行事カレンダーで。小川西町図書館は2026年11月に小川駅西口の新しいビルへ移りました。日程は図書館の案内で。</p>
  </section>
  <section class="blk">
    <h3>${bd('sh')}出張こども広場（地域センターなど・9か所）</h3>
    <p class="plain">児童館が地域センターに出張してくる日。<b>10:00〜18:00・無料・予約なし</b>。決まった曜日だけ、それぞれの地域センターで開きます。祝日などは施設の案内で。</p>
    <table class="tb dow">
      <tr class="hd"><th>曜日</th><td>場所</td></tr>
      <tr><th>月曜</th><td>美園／学園西町</td></tr>
      <tr><th>水曜</th><td>小川西町中宿（＋第1日曜）／鈴木</td></tr>
      <tr><th>木曜</th><td>学園東町（＋第2日曜）／小川東第二／喜平</td></tr>
      <tr><th>金曜</th><td>御幸（＋第3日曜）／小川西町</td></tr>
    </table>
  </section>
`, { running: '雨の日・寒い日に行ける、無料の屋内' });

// ── 4・5 見開きの地図 ───────────────────────────────────
const nb = ENTEI.neighbors;
const p4 = pageWrap(4, 'p4 mapp', `
  <h2 class="h thick2">小平の、子どもの行き先マップ</h2>
  ${legend}
  <div class="nbrow"><span>← ${esc(nb.w)}</span><span>↑ ${esc(nb.n)}</span></div>
  <div class="frame"><span class="fl">小平市</span>${mapHalf('L')}</div>
  <div class="nbrow"><span>↓ ${esc(nb.s)}</span></div>
`, { running: '見開きの地図（4・5ページ）' });
const p5 = pageWrap(5, 'p5 mapp', `
  <h2 class="h thick2">4ページから つづく</h2>
  ${legend}
  <div class="nbrow r"><span>↑ ${esc(nb.n)}</span><span>${esc(nb.e)} →</span></div>
  <div class="frame"><span class="fl">小平市</span>${mapHalf('R')}</div>
  <div class="nbrow"><span>位置は目安です（マス目に並べ直しています）。時間は2・3ページへ。</span></div>
`, { running: '見開きの地図（4・5ページ）' });

// ── 6 公園・外あそび ────────────────────────────────────
const card = (name, town, line1, agesHtml) => `<div class="pc"><h4>${esc(name)}${town ? `<small>${esc(town)}</small>` : ''}</h4><p>${esc(line1)}</p>${agesHtml}</div>`;
const p6 = pageWrap(6, 'p6', `
  <h2 class="h thick2">公園・外あそび</h2>
  <h3 class="g">小平市の公園</h3>
  <div class="pcs">
    ${card('小平中央公園', '津田町', '鷹の台駅から徒歩2分。無料。雑木林があり、プレーパークが開かれる日も。', ages('小平中央公園'))}
    ${card('萩山公園', '小川東町', '無料。イロハモミジが百本以上。秋は紅葉のライトアップ（市報こだいら）。', ages('萩山公園'))}
    ${card('小平ふるさと村', '天神町', '10:00〜16:00・無料。月曜・第3火曜・祝日の翌日は休み。水車小屋があります。', ages('小平ふるさと村'))}
    ${card('花小金井ひょうたん池公園', '', '花小金井駅 南口から徒歩約9分。無料。じゃぶじゃぶ池は例年 夏のあいだ（公式で）。', ages('花小金井ひょうたん池公園'))}
  </div>
  <h3 class="g">となりの市の定番</h3>
  <div class="pcs">
    ${card('都立 小金井公園', '小金井市', '花小金井駅 南口から約20分（つつじ山広場まで）。無料（一部有料）。大型遊具・ふわふわドーム。', ages('都立 小金井公園'))}
    ${card('都立 狭山公園', '東村山市', '多摩湖駅 南口から徒歩8分。無料。「風の広場」で親子の催しが開かれることも。', ages('都立 狭山公園（東村山）'))}
    ${card('八国山緑地・北山公園', '東村山市', '東村山駅・西武園駅から徒歩。雑木林のさんぽ道。北山公園は初夏の菖蒲。', ages('八国山緑地・北山公園（東村山）'))}
    ${card('所沢航空記念公園', '所沢市', '西武新宿線 所沢航空記念公園駅すぐ。広い芝生と大型遊具。', ages('所沢航空記念公園（所沢）'))}
    ${card('都立 六仙公園', '東久留米市', '田無駅から西武バス「イオンモール東久留米」下車 徒歩10分。パン形のすべり台。授乳室・おむつ替えはサービスセンターで（8:30〜17:30）。', ages('都立 六仙公園（東久留米）'))}
    ${card('井の頭恩賜公園', '武蔵野市', '井の頭公園駅から徒歩1分。いつでも入れる・無料。大きな池と広い園内。', ages('井の頭恩賜公園（武蔵野・吉祥寺）'))}
  </div>
`, { running: '公園・外あそび' });

// ── 7 年齢の目安・行く前のこと ────────────────────────────
const p7 = pageWrap(7, 'p7', `
  <h2 class="h thick2">年齢の目安と、行く前のこと</h2>
  <section class="blk">
    <h3>年齢の目安の見方</h3>
    <p class="plain">ぼんぼやーじゅ通信では、場所ごとに「赤ちゃん／未就学／小学生」の目安をつけています。決まりではなく、行くかどうかを考える材料です。</p>
    <table class="tb mk">
      <tr><th class="sym">◎</th><td>ぴったり</td><th class="sym">○</th><td>だいじょうぶ</td></tr>
      <tr><th class="sym">△</th><td>ひと工夫いる</td><th class="sym">✕</th><td>対象外</td></tr>
    </table>
    <p class="note">例）「赤ちゃん○　未就学◎　小学生◎」＝未就学と小学生はぴったり、赤ちゃんはだいじょうぶ。</p>
  </section>
  <section class="blk">
    <h3>行く前に</h3>
    <ul class="ul big2">
      <li><b>時間と休みの日は、変わることがあります。</b>祝日・年末年始・行事の日は、施設の案内でご確認ください。</li>
      <li>「予約なし」と「申込み・登録」は施設ごとに違います。申込みのいるものは、日にちと受付を施設の案内で。</li>
      <li>ベビーカー・おむつ替え・授乳室は、施設の案内に書いていないことは、行く前に施設へ確かめてください。</li>
      <li>月ごとの催しは、児童館・子ども家庭支援センターの「だより」、図書館の行事カレンダーに出ます。</li>
      <li>この冊子には、日にちのある催しは載せていません。</li>
    </ul>
  </section>
  <section class="blk">
    <h3>雨の日の屋内（有料のところも）</h3>
    <p class="plain">開館日・料金は、施設の案内でご確認ください。</p>
    <ul class="ul">
      <li><b>多摩六都科学館</b>（西東京市）花小金井駅 北口から徒歩約18分。はなバスもあります。月曜休館（祝日なら翌日）、祝日の翌日も休館。</li>
      <li><b>ガスミュージアム</b>（小平市・大沼町）10:00〜17:00。月曜休館（祝日なら翌日）。</li>
      <li><b>小平市ふれあい下水道館</b>（上水本町）鷹の台駅から徒歩7分。10:00〜16:00。月曜休館（祝日なら翌日）。</li>
    </ul>
  </section>
`, { running: '年齢の目安と、行く前のこと' });

// ── 8 裏表紙 ────────────────────────────────────────
const p8 = pageWrap(8, 'back', `
  <div class="bkbrand">ぼんぼやーじゅ通信</div>
  <p class="bklead thick">毎週水曜の朝、週末のおでかけ情報が届きます</p>
  <p class="plain c">小平市と、となりの市の催しを、年齢の目安つきで。無料・LINEの友だち追加だけで、お名前などの入力はいりません。</p>
  <div class="qrbox sm">
    ${qrImg(54)}
    <div class="qrcap2">スマホで読み取ってください</div>
  </div>
  <p class="step">読み取ると、ホームページが開きます。「LINEで友だち追加（無料）」のボタンを押してください。</p>
  <p class="plain c">ホームページ　<b class="url">${URL_HOME}</b></p>
  <p class="plain c">催しの日にちは、市や施設の公式ページで一件ずつ確かめています。まとめサイトからの転載はしません。</p>
  <div class="colo">
    <p><b>広告は載せていません。</b>お持ち帰りは無料です。</p>
    <p>内容は${ISSUE}時点です。出かける前に、各施設の案内でご確認ください。</p>
    <p>発行：ぼんぼやーじゅ通信の会（小平市・花小金井）／小平市民活動支援センター あすぴあ 登録団体（第254号）</p>
  </div>
`, { footer: false });

// ── CSS ───────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
body{font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif;font-weight:500;color:#1E1E1E;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.thick{paint-order:stroke fill;-webkit-text-stroke:.030em currentColor}
.thick2{paint-order:stroke fill;-webkit-text-stroke:.048em currentColor}
.page{width:148mm;height:210mm;overflow:hidden;background:#fff;padding:9mm 11mm 9mm;display:flex;flex-direction:column;position:relative;break-after:page}
.main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.rh{display:flex;justify-content:space-between;align-items:baseline;border-bottom:.3mm solid #7A7A7A;padding-bottom:1.4mm;margin-bottom:3mm;font-size:2.9mm;color:#4A4A4A}
.brandmini{font-family:"Mochiy Pop One",sans-serif;color:#2C7C9E;font-size:3mm;letter-spacing:.03em}
.pf{flex:none;text-align:center;font-size:2.9mm;color:#4A4A4A;padding-top:1.2mm}
h2.h{font-family:"Zen Kurenaido","Zen Maru Gothic",sans-serif;font-size:5.4mm;line-height:1.3;color:#1E1E1E;margin:0 0 2mm;padding-left:2.8mm;border-left:1.4mm solid #2C7C9E}
h3{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700;font-size:3.9mm;display:flex;align-items:center;gap:1.8mm;margin:0 0 1.4mm;line-height:1.3}
h3.g{display:block;font-size:3.7mm;margin:2.2mm 0 1.4mm;padding-bottom:.8mm;border-bottom:.35mm solid #1E1E1E}
.lead{font-size:3.2mm;line-height:1.6;margin:0 0 2.6mm;color:#333}
.lead2{font-size:3mm;line-height:1.5;margin:0 0 2mm;color:#333}
.blk{margin:0 0 3.4mm}
.big{font-size:3.25mm;line-height:1.55;margin:0 0 1.4mm}
.big b,.plain b,.ul b,.note b{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700}
.plain{font-size:3.05mm;line-height:1.6;margin:0 0 1.2mm}
.plain.c{text-align:center}
.note{font-size:2.9mm;line-height:1.55;color:#4A4A4A;margin:1.2mm 0 0}
.ul{list-style:none;font-size:3.0mm;line-height:1.55}
.ul li{padding-left:3.2mm;position:relative;margin:0 0 .9mm}
.ul li::before{content:"";display:inline-block;width:1.3mm;height:1.3mm;background:#2C7C9E;border-radius:50%;margin:0 0 0 -3.2mm;margin-right:1.9mm;vertical-align:.25mm}
.ul.big2{font-size:3.15mm;line-height:1.6}
.ul.big2 li{margin-bottom:1.4mm}
/* 表 */
.tb{width:100%;border-collapse:collapse;font-size:2.95mm;line-height:1.45;margin:0 0 1.4mm}
.tb th,.tb td{border:.25mm solid #8A8A8A;padding:.8mm 1.5mm;text-align:left;vertical-align:top;font-weight:500}
.tb th{background:#EDEDED;font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700;width:30%}
.tb tr.hd th,.tb tr.hd td{background:#D8D8D8;font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700}
.tb.lib th{width:23%}.tb.lib td{width:38.5%}
.tb.lib tr.nt td{border-top:none;font-size:2.9mm;color:#333;padding-top:0}
.tb.dow th{width:14%}
.tb.ji th{width:46%}
.tb.mk th.sym{width:11%;text-align:center;font-size:4.4mm;font-family:"Zen Maru Gothic",sans-serif;font-weight:700;vertical-align:middle}
.tb.mk td{width:39%;vertical-align:middle}
/* 種類の目印：色＋形＋文字（白黒でも分かる） */
.bd{display:inline-flex;align-items:center;justify-content:center;width:5.4mm;height:5.4mm;flex:none;font-style:normal;font-family:"Zen Kaku Gothic New",sans-serif;font-weight:700;font-size:3mm;color:#fff;line-height:1}
.k-lib{background:#2A6BA6}.k-lib.bd{border-radius:.7mm}
.k-ji{background:#C4561A}.k-ji.bd{clip-path:polygon(50% 0,100% 38%,100% 100%,0 100%,0 38%);padding-top:1.2mm}
.k-ko{background:#2B8A57}.k-ko.bd{border-radius:50%}
.k-sh{background:#7A4FA3}.k-sh.bd{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.k-hi{background:#8F5C06}.k-hi.bd{clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}
.k-st{background:#33414B}.k-st.bd{border-radius:.7mm;width:5.4mm;height:4.4mm;font-size:2.9mm}
/* 地図 */
.mapp .main{min-height:0}
.legend{display:flex;flex-wrap:wrap;gap:1.2mm 3.2mm;font-size:2.9mm;margin:0 0 2mm;align-items:center}
.legend span{display:inline-flex;align-items:center;gap:1mm;white-space:nowrap}
.nbrow{display:flex;justify-content:space-between;font-size:2.9mm;color:#4A4A4A;padding:0 .5mm;margin:0 0 .8mm;min-height:3.9mm}
.frame{flex:1 1 auto;min-height:0;border:.6mm solid #1E1E1E;border-radius:1.6mm;padding:1mm;display:flex;flex-direction:column;position:relative}
.fl{align-self:flex-start;font-size:2.9mm;font-weight:700;font-family:"Zen Kaku Gothic New",sans-serif;margin:0 0 .8mm 1mm}
.grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(7,1fr);gap:.9mm}
.cell{border:.3mm dashed #BDBDBD;border-radius:1.1mm;display:flex;align-items:center;gap:1.3mm;padding:.9mm 1.2mm;min-width:0;min-height:0;overflow:hidden}
.cell.empty{border-style:dotted;border-color:#DADADA}
.cell .ct{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.cell .ct b{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700;font-size:3.2mm}
.cell .ct small{font-size:2.9mm;color:#3A3A3A}
.cell.tt{border-style:solid;border-width:.35mm}
.k-lib-c{background:#E6EEF7;border-color:#2A6BA6}
.k-ji-c{background:#FBEBDD;border-color:#C4561A;border-width:.8mm!important}
.k-ko-c{background:#E2F2E8;border-color:#2B8A57;border-style:dashed!important}
.k-sh-c{background:#EEE6F5;border-color:#7A4FA3;border-style:dotted!important;border-width:.6mm!important}
.k-hi-c{background:#F8EFD3;border-color:#8F5C06;border-style:double!important;border-width:1mm!important}
.cell.st{background:#E9EDF0;border:.3mm solid #33414B;border-radius:.6mm}
.cell.st b{font-family:"Zen Kaku Gothic New",sans-serif;font-weight:700;font-size:3.1mm}
/* 公園 */
.pcs{display:grid;grid-template-columns:1fr 1fr;gap:2mm}
.pc{border:.3mm solid #8A8A8A;border-radius:1.8mm;padding:1.3mm 2mm;background:#F6F6F6;min-width:0}
.pc h4{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700;font-size:3.3mm;line-height:1.3;margin:0 0 .5mm}
.pc h4 small{font-size:2.9mm;font-weight:500;color:#4A4A4A;margin-left:1.4mm}
.pc p{font-size:2.9mm;line-height:1.45;margin:0 0 .5mm;color:#222}
.ag{display:block;font-size:2.9mm;color:#222;border-top:.25mm solid #9A9A9A;margin-top:.8mm;padding-top:.7mm;font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700}
/* 表紙・裏表紙 */
.cover .main,.back .main{align-items:center;text-align:center}
.cover{padding-top:11mm}
.addr{font-size:3.4mm;font-family:"Zen Kaku Gothic New",sans-serif;font-weight:700;border:.35mm solid #1E1E1E;border-radius:99mm;padding:1.4mm 4mm;margin-bottom:3.2mm}
.brandline{font-family:"Mochiy Pop One",sans-serif;color:#2C7C9E;font-size:3.6mm;letter-spacing:.04em}
.ttl{font-family:"Zen Kurenaido","Zen Maru Gothic",sans-serif;font-weight:400;font-size:10.6mm;line-height:1.25;margin:2mm 0 2.2mm;color:#1E1E1E;letter-spacing:.02em}
.sub{font-size:3.2mm;line-height:1.55;color:#333;margin:0 6mm}
.deco{width:118mm;height:auto;margin:3mm 0 1mm;flex:none}
.qrbox{border:.8mm solid #1E1E1E;border-radius:3mm;padding:2.6mm 5mm 2.4mm;margin:2mm 0 2.6mm;background:#fff}
.qrbox.sm{padding:2.2mm 4mm 2mm;margin:2mm 0 2mm}
.qrcap1{font-family:"Zen Kurenaido","Zen Maru Gothic",sans-serif;font-size:4.6mm;margin:0 0 .6mm;color:#1E1E1E}
.qrcap2{font-size:3mm;color:#333;margin:.4mm 0 0}
.qr{display:block;margin:0 auto;background:#fff}
.promise{font-size:3.3mm;line-height:1.6;margin:0 0 1.4mm}
.promise b{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700;font-size:3.6mm}
.step{font-size:2.9mm;line-height:1.5;color:#333;margin:0 6mm 1.2mm}
.back{padding-top:14mm}
.bkbrand{font-family:"Mochiy Pop One",sans-serif;color:#2C7C9E;font-size:7.4mm;letter-spacing:.04em;margin:0 0 2mm}
.bklead{font-family:"Zen Kurenaido","Zen Maru Gothic",sans-serif;font-size:4.9mm;line-height:1.4;margin:0 0 2.4mm}
.url{font-size:3.5mm}
.colo{margin-top:auto;border-top:.3mm solid #7A7A7A;padding-top:2mm;text-align:left;width:100%;font-size:2.9mm;line-height:1.55;color:#333}
.colo p{margin:0 0 .8mm}
.colo b{font-family:"Zen Kaku Gothic New","Zen Maru Gothic",sans-serif;font-weight:700}
`;

const PAGES = [cover(TITLE_KEY), p2, p3, p4, p5, p6, p7, p8];
const head = (title, size) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${size};margin:0}${CSS}</style></head><body>`;

function writePages() {
  PAGES.forEach((h, i) => writeFileSync(`${OUT}/page-${i + 1}.html`, `${head(`小児科の待合室用 情報誌 ${i + 1}/8`, '148mm 210mm')}${h}</body></html>`));
  writeFileSync(`${OUT}/spread-4-5.html`, `${head('見開き 4-5', '296mm 210mm')}<div style="display:flex;width:296mm">${p4}${p5}</div></body></html>`);
  for (const k of Object.keys(TITLES)) writeFileSync(`${OUT}/cover-${k}.html`, `${head(`表紙 案${k}`, '148mm 210mm')}${cover(k)}</body></html>`);
  writeFileSync(`${OUT}/booklet-a5-pages.html`, `${head('A5 全ページ', '148mm 210mm')}${PAGES.join('')}</body></html>`);
  // 面付け（中綴じ）: 表紙・裏表紙が外側、中央の見開きが4-5ページ。短辺とじの両面
  const sheets = [[8, 1], [2, 7], [6, 3], [4, 5]];
  const sheet = ([l, r]) => `<div class="sheet"><div class="slot l">${PAGES[l - 1]}</div><div class="slot r">${PAGES[r - 1]}</div><i class="tick t"></i><i class="tick b"></i></div>`;
  writeFileSync(`${OUT}/imposed.html`, `${head('面付け A4横', '297mm 210mm')}<style>
    .sheet{width:297mm;height:210mm;display:flex;position:relative;break-after:page;overflow:hidden}
    .slot{width:148.5mm;height:210mm;overflow:hidden}.slot .page{break-after:auto}
    .tick{display:block;width:.3mm;height:4mm;background:#999;margin-left:-.15mm;position:absolute;left:148.5mm}
    .tick.t{top:1.5mm}.tick.b{bottom:1.5mm}
  </style>${sheets.map(sheet).join('')}</body></html>`);
}
writePages();

// ── PDF・検査 ──────────────────────────────────────
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const browser = await chromium.launch();
const U = (f) => pathToFileURL(resolve(`${OUT}/${f}`)).href;
async function open(f, vw, vh, scale = 1) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale });
  await page.goto(U(f), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function pdf(f, out, w, h) {
  const page = await open(f, 800, 800);
  await page.pdf({ path: `${OUT}/${out}`, width: w, height: h, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
}
await pdf('imposed.html', 'booklet-a4-imposed.pdf', '297mm', '210mm');
await pdf('booklet-a5-pages.html', 'booklet-a5-pages.pdf', '148mm', '210mm');

const PX_MM = 96 / 25.4;
let ng = false;
const report = [];
for (let i = 1; i <= 8; i++) {
  const page = await open(`page-${i}.html`, Math.ceil(148 * PX_MM), Math.ceil(210 * PX_MM), 2);
  const r = await page.evaluate(() => {
    const pg = document.querySelector('.page'), main = pg.querySelector('.main');
    const pr = pg.getBoundingClientRect();
    let maxB = 0, minL = 1e9, maxR = 0, minFont = 1e9, minFontTxt = '';
    const walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement, st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) {
        if (b.width < 1) continue;
        maxB = Math.max(maxB, b.bottom); minL = Math.min(minL, b.left); maxR = Math.max(maxR, b.right);
      }
      const fs = parseFloat(st.fontSize);
      if (fs < minFont) { minFont = fs; minFontTxt = n.textContent.trim().slice(0, 12); }
    }
    // 箱が .main や .page からはみ出していないか（グリッドのセル内の溢れも）
    let cellOver = 0;
    pg.querySelectorAll('.cell,.pc,.tb td,.tb th,.qrbox').forEach((e) => { if (e.scrollHeight - e.clientHeight > 1 || e.scrollWidth - e.clientWidth > 1) cellOver++; });
    return {
      over: pg.scrollHeight - pg.clientHeight, mainOver: main.scrollHeight - main.clientHeight,
      gapMm: (pr.bottom - maxB) / (96 / 25.4), leftMm: (minL - pr.left) / (96 / 25.4), rightMm: (pr.right - maxR) / (96 / 25.4),
      minPt: minFont * 0.75, minTxt: minFontTxt, cellOver,
    };
  });
  const { hits, checked } = await checkTextOverlap(page);
  const bad = r.over > 1 || r.mainOver > 1 || r.gapMm < 7 || r.leftMm < 6 || r.rightMm < 6 || r.minPt < 8 || hits.length || r.cellOver;
  if (bad) ng = true;
  const line = `${bad ? '🔴' : '  '} p${i}  はみ出し ${r.over}px/${r.mainOver}px  下端 ${r.gapMm.toFixed(1)}mm  左 ${r.leftMm.toFixed(1)}mm 右 ${r.rightMm.toFixed(1)}mm  最小 ${r.minPt.toFixed(2)}pt「${r.minTxt}」  箱の溢れ ${r.cellOver}  重なり ${hits.length}件(${checked}箇所)`;
  console.log(line); report.push(line);
  hits.forEach((h) => console.error('     ' + h));
  await page.screenshot({ path: `${OUT}/preview/page-${i}.png` });
  await page.close();
}
// 見開き
{
  const page = await open('spread-4-5.html', Math.ceil(296 * PX_MM), Math.ceil(210 * PX_MM), 2);
  await page.screenshot({ path: `${OUT}/preview/spread-4-5.png` });
  await page.close();
}
for (const k of Object.keys(TITLES)) {
  const page = await open(`cover-${k}.html`, Math.ceil(148 * PX_MM), Math.ceil(210 * PX_MM), 2);
  const over = await page.evaluate(() => { const p = document.querySelector('.page'); const g = p.getBoundingClientRect().bottom - [...p.querySelectorAll('.colo,.step,.promise')].pop().getBoundingClientRect().bottom; return { o: p.scrollHeight - p.clientHeight, g: g / (96 / 25.4) }; });
  const { hits } = await checkTextOverlap(page);
  const line = `   表紙 案${k}  はみ出し ${over.o}px  下端 ${over.g.toFixed(1)}mm  重なり ${hits.length}件`;
  if (over.o > 1 || over.g < 7 || hits.length) { ng = true; console.error('🔴' + line); }
  console.log(line); report.push(line);
  await page.screenshot({ path: `${OUT}/preview/cover-${k}.png` });
  await page.close();
}
// QRの位置（検査用）
{
  const page = await open('page-1.html', 560, 794, 1);
  const q = await page.evaluate(() => { const r = document.querySelector('.qr').getBoundingClientRect(); const p = document.querySelector('.page').getBoundingClientRect(); const mm = 96 / 25.4; return { x: (r.left - p.left) / mm, y: (r.top - p.top) / mm, w: r.width / mm }; });
  writeFileSync(`${OUT}/preview/qr-pos-cover.json`, JSON.stringify(q));
  await page.close();
  const page8 = await open('page-8.html', 560, 794, 1);
  const q8 = await page8.evaluate(() => { const r = document.querySelector('.qr').getBoundingClientRect(); const p = document.querySelector('.page').getBoundingClientRect(); const mm = 96 / 25.4; return { x: (r.left - p.left) / mm, y: (r.top - p.top) / mm, w: r.width / mm }; });
  writeFileSync(`${OUT}/preview/qr-pos-back.json`, JSON.stringify(q8));
  await page8.close();
}
await browser.close();
writeFileSync(`${OUT}/preview/layout-report.txt`, report.join('\n') + '\n');
if (ng) { console.error('\n🔴 版面に問題がある。刷らないこと。'); process.exit(1); }
console.log('\n版面の検査は合格。続けて QR・書体・面付けを検査する（scratchpad の check-booklet.py）。');
