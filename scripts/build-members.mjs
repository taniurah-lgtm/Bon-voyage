#!/usr/bin/env node
// 会員ページを「合言葉ゲート＋中身をAES-GCM暗号化」でビルドする。
// 使い方: MEMBER_PASS=xxx INSIDER_PASS=yyy node scripts/build-members.mjs
// 合言葉はリポジトリに保存しない(暗号文だけ出力)。ブラウザのWeb Cryptoで復号する。
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const OUT = 'docs/homepage/m/s7f2ka/index.html';
// 実際の合言葉はリポジトリに保存しない。ビルド時に環境変数で渡す(1つ以上):
//   MEMBER_PASS=xxx [INSIDER_PASS=yyy] node scripts/build-members.mjs
// 出力(index.html)は暗号文のみで、合言葉は含まれない(PBKDF2+AES-GCM)。
const PASSES = [process.env.MEMBER_PASS, process.env.INSIDER_PASS].filter(Boolean);
if (PASSES.length === 0) PASSES.push('CHANGEME');
const ITER = 150000;
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptFor(pass, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

// --- おでかけカレンダー（先の予定・花小金井圏の家族向け） ---
const gcal = (text, dates, location, details) =>
  'https://calendar.google.com/calendar/render?' + new URLSearchParams(
    { action: 'TEMPLATE', text, dates, ctz: 'Asia/Tokyo', location, details }).toString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const E = [
  ['7/22(水)・23(木) 17:00〜','20260722T170000/20260722T210000','神楽坂まつり ほおずき市','🏮','神楽坂','https://summer.walkerplus.com/odekake/detail_e/ar0313e71549/','ほおずき市と屋台。夕方の17時台が狙い目。🧒○ 🎒○'],
  ['7/25(土) 15:00〜','20260725T150000/20260725T190000','陸上自衛隊 小平駐屯地 納涼祭','🚒','陸上自衛隊小平駐屯地','https://kodaira-tourism.com/event/3369/','働く車展示＋盆踊り。地元・無料・明るいうちに。👶○ 🧒◎ 🎒◎'],
  ['7/25(土) 19:30〜','20260725T193000/20260725T200000','西武園ゆうえんち 大火祭り(花火)','🎆','西武園ゆうえんち','https://www.seibuen-amusement-park.jp/2026summer/','至近距離の花火が約6分。近くて短時間・撤収ラク。要入園料。👶○ 🧒◎'],
  ['7/25(土) 19:15〜','20260725T191500/20260725T201500','立川まつり 昭和記念公園花火','🎇','国営昭和記念公園','https://hanabi.tokyo-tachikawa.org/','多摩最大級5,000発。2026は有料観覧席制(1,500円)。芝生で観覧。🧒◎ 🎒◎'],
  ['7/25(土)・26(日) 18:00〜','20260725T180000/20260725T210000','小金井阿波おどり','💃','武蔵小金井駅','https://koganeiawaodori.jp/','駅前は大混雑。18時台の沿道端で。🧒△ 🎒○'],
  ['7/27(月)・28(火) 17:00〜','20260727T170000/20260727T210000','秋津神社 例大祭','🏮','秋津神社','','新秋津駅すぐ・屋台30店超。平日で空きやすい。🧒◎ 🎒◎'],
  ['7/30(木)・31(金) 18:00〜','20260730T180000/20260730T210000','田無納涼盆踊り大会','🥁','田無山總持寺','','田無駅北口・屋台多数。西武新宿線。🧒◎ 🎒◎'],
  ['8/1(土) 18:30〜','20260801T183000/20260801T203000','小平グリーンロード灯りまつり ★地元','🏮','小平グリーンロード','https://www.city.kodaira.tokyo.jp/event/127/127980.html','手作り灯ろう約4,000基。徒歩圏・夜も早めに終わる。👶◎ 🧒◎ 🎒◎'],
  ['8/1(土)・2(日) 18:00〜','20260801T180000/20260801T213000','江戸東京たてもの園 下町夕涼み','🏮','江戸東京たてもの園','https://www.tatemonoen.jp/event/page/2026_yusuzumi.php','提灯の下町・ちびっ子縁日。小学生以下は例年無料。👶◎ 🧒◎'],
  ['8/1(土) 19:30〜','20260801T193000/20260801T200000','狭山入間川七夕まつり 花火 ★西武新宿線','🎆','狭山市駅','https://www.city.sayama.saitama.jp/kankou/kanko/tanabata/index.html','約2,000発・30分完結で幼児向き。急行約35分。👶○ 🧒◎'],
  ['8/8(土)〜15 19:30〜','20260808T193000/20260808T194500','西武園 大火祭り(お盆は毎日)','🎆','西武園ゆうえんち','https://www.seibuen-amusement-park.jp/2026summer/','お盆期間は毎日。平日に行けるのが強み。👶○ 🧒◎'],
  ['8/22(土)・23(日) 17:00〜','20260822T170000/20260822T200000','三鷹阿波おどり','💃','三鷹駅南口','https://mitaka-awaodori.com/','コンパクトで20時終了。花小金井からバス直行あり。🧒○ 🎒○'],
  ['8/29(土)・30(日)','20260829T160000/20260829T210000','滝山・前沢みんなの夏祭り ★市内最大級','🏮','滝山中央通り 東久留米','http://takiyama.in.coocan.jp/','三世代舞まつり・阿波踊り・屋台がずらり。花小金井からバス「滝山センター」。人出が多いので抱っこ紐が安心。🧒○ 🎒◎'],
  ['8/29(土) 20:00〜','20260829T200000/20260829T203000','昭島市民くじら祭+夢花火 ★穴場','🐳','昭和公園 東中神','https://akishima-kujiramatsuri.jp/','混雑ゆるめ・駅近で撤収楽。花火20時開始。👶◎ 🧒◎ 🎒◎'],
  ['9/19(土)〜23(水・祝)','20260919/20260924','シルバーウィーク5連休','🗓','—','','11年ぶりの5連休。高原・温泉・テーマパーク・動物園・味覚狩り(ぶどう/芋)など、日帰り〜1泊で。人気の宿・施設は早めの計画を。'],
];

const cards = E.map(([disp, dates, name, emoji, mapq, off, note]) => {
  let details = note;
  if (off) details += '\n🔗 ' + off;
  if (mapq && mapq !== '—') details += '\n📍 https://www.google.com/maps/search/?api=1&query=' + mapq;
  const cal = gcal(name, dates, mapq !== '—' ? mapq : '', details);
  let links = `<a class="lk cal" href="${esc(cal)}" target="_blank" rel="noopener">📅 カレンダーに追加</a>`;
  if (mapq && mapq !== '—') links += `<a class="lk map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapq)}" target="_blank" rel="noopener">📍 地図</a>`;
  if (off) links += `<a class="lk off" href="${esc(off)}" target="_blank" rel="noopener">🔗 公式</a>`;
  return `      <div class="ev"><div class="when">${esc(disp)}</div><div class="nm">${emoji} ${esc(name)}</div><div class="desc">${esc(note)}</div><div class="links">${links}</div></div>`;
}).join('\n');

// 連休さきどり（キャンプ偏重にしない・テーマ別）
const renkyu = `
  <h2 class="sec" id="renkyu">🍁 連休さきどり（9/19〜23 シルバーウィーク）</h2>
  <p class="sec-note">キャンプ以外も。花小金井から日帰り〜1泊で行ける秋の連休を、テーマ別に。人気の宿・体験は早めに。</p>
  <div class="ev"><div class="nm">🍇 秋の味覚狩り（ぶどう＆芋）</div><div class="desc">小松沢レジャー農園（秩父・横瀬／西武秩父線・横瀬駅から無料送迎バス）＝ぶどう狩り（例年8月中旬〜11月上旬）＋さつま芋掘り（例年9月下旬〜）＋マスつかみ。屋根つき体験多めで2歳連れも◎。ぶどうは山梨・勝沼も名産。※開催時期・料金は公式で確認を。</div><div class="links"><a class="lk map" href="https://www.google.com/maps/search/?api=1&query=小松沢レジャー農園" target="_blank" rel="noopener">📍 地図</a><a class="lk off" href="https://www.komatsuzawa.co.jp/" target="_blank" rel="noopener">🔗 公式</a></div></div>
  <div class="ev"><div class="nm">🏞 高原で涼む・自然（1泊向き）</div><div class="desc">清里/八ヶ岳・富士五湖ほか。標高が高く涼しく、牧場で動物ふれあいも。人気宿は連休ぶんが早く埋まるので早めに。</div></div>
  <div class="ev"><div class="nm">♨ 子連れ温泉（1泊・のんびり）</div><div class="desc">秩父/奥多摩/箱根の子連れ歓迎の宿。部屋食・貸切風呂だと2歳連れも安心。連休は満室が早いので今のうちに候補押さえを。</div></div>
  <div class="ev"><div class="nm">🎠 雨でも安心のテーマパーク・室内</div><div class="desc">サンリオピューロランド（多摩・全天候の室内）は天気に左右されない。西武園ゆうえんち（近い）は大火祭りの花火が9/19〜23も開催。</div><div class="links"><a class="lk off" href="https://www.puroland.jp/" target="_blank" rel="noopener">🔗 ピューロランド</a><a class="lk off" href="https://www.seibuen-amusement-park.jp/2026summer/" target="_blank" rel="noopener">🔗 西武園</a></div></div>
  <div class="ev"><div class="nm">🏕 キャンプ（早めに予約）</div><div class="desc">C&C山中湖ほか高原キャンプ。予約は例年2ヶ月前の月末20時ごろ開始（9月分は7月末ごろ）。人気なので、最新の受付日を公式で確認して早めに。日曜泊やキャンセル拾いも。</div><div class="links"><a class="lk off" href="https://www.camp-cabins.com/yamanakako/" target="_blank" rel="noopener">🔗 公式</a></div></div>
  <p class="note">※営業日・料金・味覚狩りの解禁時期は変わります。おでかけ前に各公式でご確認を。</p>`;

// 創刊サポーター（はじめの20名）。掲載は希望者のみ。
// 形式: [番号, 表示名, ひとこと(任意)]。掲載を希望されない方はここに載せない（人数だけ FOUNDING_TOTAL で数える）。
const FOUNDING = [
  // 例: [1, 'たにうら', '花小金井・3きょうだい'],
];
// 掲載を希望されない方も含めた実人数。0 のあいだはセクションごと出さない。
const FOUNDING_TOTAL = 0;

const founding = FOUNDING_TOTAL === 0 ? '' : `
  <h2 class="sec" id="founding">🎖 創刊サポーター</h2>
  <p class="sec-note">この通信を、いちばん最初に支えてくださっている方々です（掲載はご希望の方のみ）。ありがとうございます。</p>
  <div class="card"><ul>${
    FOUNDING.map(([no, nm, memo]) => `<li><b>No.${no}</b> ${esc(nm)}${memo ? ` <span class="note">— ${esc(memo)}</span>` : ''}</li>`).join('')
  }${
    FOUNDING_TOTAL > FOUNDING.length ? `<li class="note">ほか ${FOUNDING_TOTAL - FOUNDING.length} 名の方に支えていただいています。</li>` : ''
  }</ul></div>`;

// 暗号化する中身（創刊サポーター＋カレンダー＋連休さきどり＋バックナンバー＋投稿マップ）
const CONTENT = `
  <nav class="toc">
    <a href="#cal">📅 カレンダー</a>
    <a href="#renkyu">🍁 連休さきどり</a>
    <a href="#back">📮 バックナンバー</a>
    <a href="#map">🗺 投稿マップ</a>${FOUNDING_TOTAL === 0 ? '' : '\n    <a href="#founding">🎖 創刊サポーター</a>'}
  </nav>
  <h2 class="sec" id="cal">📅 おでかけカレンダー</h2>
  <p class="sec-note">花小金井まわりの先の予定を日付順に。行きたいものを「カレンダーに追加」で保存できます。</p>
${cards}
${renkyu}

  <h2 class="sec" id="back">📮 通信バックナンバー</h2>
  <div class="card"><ul><li>最新号は毎週水曜に配信（LINE）</li><li>過去号もこのページで順次公開していきます</li></ul></div>

  <h2 class="sec" id="map">🗺 みんなの投稿マップ <span class="note" style="font-weight:400">（準備中）</span></h2>
  <div class="soon">会員のみなさんで「よかったおでかけ先」を地図に書き込んで育てる、参加型マップを準備しています。公開までもう少しお待ちください。</div>
${founding}

  <p class="note" style="margin-top:1.6rem">📅 ボタンはご自分のGoogleカレンダーに保存する形です。リマインダーはカレンダー側でお好みに設定できます。日程・料金は変わることがあるので、おでかけ前に各公式でご確認ください。</p>`;

const CSS = `:root{--ground:#FBFAF5;--surface:#FFFFFF;--surface-2:#F5F2EA;--ink:#34434C;--ink-soft:#63727B;--ink-faint:#97A2AA;--sky:#4FA3C4;--sky-deep:#2C7C9E;--sky-wash:#E9F4F7;--marigold:#EBA24A;--marigold-wash:#FBEEDA;--leaf:#74AE71;--line:#ECE7DB;--line-strong:#DCD5C6;--radius:18px;--maru:"Hiragino Maru Gothic ProN","Yu Gothic","Noto Sans JP","Segoe UI",sans-serif;--body:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP","Segoe UI",Meiryo,sans-serif;--script:Georgia,"Times New Roman",serif;}
@media (prefers-color-scheme:dark){:root{--ground:#131F28;--surface:#1A2831;--surface-2:#21333D;--ink:#ECF2F4;--ink-soft:#AAB9C1;--ink-faint:#7B8C95;--sky:#6FBAD9;--sky-deep:#9AD4EA;--sky-wash:#1D3944;--marigold:#F0AE5E;--marigold-wash:#362F1F;--leaf:#8FC489;--line:#293B45;--line-strong:#38505C;}}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--body);line-height:1.8;-webkit-font-smoothing:antialiased;font-feature-settings:"palt" 1;}
.nav{position:fixed;top:0;left:0;right:0;z-index:50;background:var(--surface);border-bottom:1px solid var(--line);box-shadow:0 3px 14px rgba(52,67,76,.10);transform:translateY(-100%);transition:transform .25s ease;}
.nav.show{transform:translateY(0);}
.nav-in{max-width:44rem;margin:0 auto;display:flex;justify-content:center;gap:.3rem;padding:.5rem .5rem;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.nav-in::-webkit-scrollbar{display:none;}
.nav-in a{flex:none;font-size:.8rem;font-weight:700;color:var(--ink-soft);text-decoration:none;padding:.4rem .62rem;border-radius:999px;background:var(--surface-2);white-space:nowrap;}
.toc{display:flex;flex-wrap:wrap;gap:.5rem;margin:.3rem 0 1.5rem;padding:0;}
.toc a{font-size:.85rem;font-weight:700;color:var(--sky-deep);text-decoration:none;background:var(--sky-wash);border:1px solid var(--line);border-radius:999px;padding:.4rem .85rem;}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem;}
a{color:var(--sky-deep);}
header.h{background:linear-gradient(160deg,var(--sky-wash),var(--marigold-wash));border-bottom:1px solid var(--line);}
.h-in{max-width:44rem;margin:0 auto;padding:2.2rem 1.25rem 1.6rem;}
.eyebrow{font-family:var(--script);font-style:italic;color:var(--marigold);font-size:1rem;}
h1{font-family:var(--maru);font-weight:800;font-size:1.6rem;margin:.2rem 0 .4rem;letter-spacing:.02em;}
.h-in .sub{color:var(--ink-soft);font-size:.93rem;margin:0;}
main{padding:1.6rem 0 1rem;}
h2.sec{font-family:var(--maru);font-weight:800;font-size:1.2rem;margin:1.8rem 0 .3rem;display:flex;align-items:center;gap:.4rem;scroll-margin-top:3.6rem;}
.sec-note{color:var(--ink-soft);font-size:.9rem;margin:0 0 1rem;}
.ev{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:.95rem 1.1rem;margin-bottom:.8rem;box-shadow:0 2px 14px rgba(52,67,76,.05);}
.ev .when{color:var(--sky-deep);font-size:.82rem;font-weight:800;}
.ev .nm{font-family:var(--maru);font-weight:800;font-size:1.04rem;margin-top:.1rem;}
.ev .desc{font-size:.92rem;color:var(--ink-soft);margin-top:.3rem;}
.links{margin-top:.6rem;display:flex;flex-wrap:wrap;gap:.45rem;}
.lk{display:inline-flex;align-items:center;gap:.25rem;font-size:.8rem;font-weight:700;text-decoration:none;border-radius:999px;padding:.35rem .75rem;border:1px solid var(--line-strong);}
.lk.cal{background:var(--sky-deep);color:#fff;border-color:var(--sky-deep);}
.lk.map{color:var(--sky-deep);background:var(--surface);}
.lk.off{color:var(--marigold);background:var(--surface);}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.15rem;}
.card ul{margin:.2rem 0 0;padding-left:1.1rem;} .card li{font-size:.94rem;margin:.2rem 0;}
.soon{background:var(--surface-2);border:1px dashed var(--line-strong);border-radius:var(--radius);padding:1.1rem 1.2rem;color:var(--ink-soft);}
.note{font-size:.82rem;color:var(--ink-faint);}
footer{color:var(--ink-faint);font-size:.8rem;text-align:center;padding:2rem 1.25rem 3rem;line-height:1.7;}
.fmark{font-family:var(--maru);font-weight:800;color:var(--ink-soft);}
.gate{max-width:24rem;margin:3rem auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1.6rem 1.4rem;text-align:center;box-shadow:0 2px 16px rgba(52,67,76,.06);}
.gate h2{font-family:var(--maru);font-weight:800;font-size:1.15rem;margin:0 0 .4rem;}
.gate p{color:var(--ink-soft);font-size:.9rem;margin:0 0 1rem;}
.gate input{width:100%;font-size:1.05rem;padding:.7rem .8rem;border:1px solid var(--line-strong);border-radius:12px;background:var(--ground);color:var(--ink);}
.gate button{margin-top:.8rem;width:100%;font-family:var(--maru);font-weight:800;font-size:1.05rem;color:#fff;background:var(--sky-deep);border:none;border-radius:999px;padding:.75rem;cursor:pointer;}
.gate .err{color:#C0554E;font-size:.86rem;margin-top:.7rem;min-height:1.1em;}
.gate .hint{font-size:.8rem;color:var(--ink-faint);margin-top:.9rem;}
.gate .cta{margin-top:1.3rem;padding-top:1.15rem;border-top:1px solid var(--line);}
.gate .cta .lead{font-size:.85rem;color:var(--ink-soft);margin:0 0 .8rem;line-height:1.7;}
.gate .join{display:block;font-family:var(--maru);font-weight:800;font-size:1rem;color:#fff;background:var(--marigold);border:none;border-radius:999px;padding:.72rem;text-decoration:none;}
.gate .more{display:inline-block;margin-top:.75rem;font-size:.82rem;color:var(--sky-deep);text-decoration:none;}`;

const BLOBS = [];
for (const p of PASSES) BLOBS.push(await encryptFor(p.normalize('NFC'), CONTENT));

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>会員ページ｜ぼんぼやーじゅ通信</title>
<style>${CSS}</style>
</head>
<body>
<header class="h" id="top"><div class="h-in">
  <div class="eyebrow">Members</div>
  <h1>ぼんぼやーじゅ通信・会員ページ</h1>
  <p class="sub">応援サポーター向けのページです。</p>
</div></header>
<nav id="nav" class="nav" style="display:none"><div class="nav-in">
  <a href="#top">ホーム</a>
  <a href="#cal">カレンダー</a>
  <a href="#back">バックナンバー</a>
  <a href="#map">投稿マップ</a>
</div></nav>

<main class="wrap">
  <div id="gate" class="gate">
    <h2>🔑 合言葉を入力</h2>
    <p>会員の方にお伝えした合言葉を入れてください。</p>
    <input id="pw" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="合言葉" autofocus>
    <button id="go">ひらく</button>
    <div id="err" class="err"></div>
    <div class="hint">合言葉が分からない方は、ご登録いただいたnoteの掲示板をご確認ください。</div>
    <div class="cta">
      <p class="lead">まだサポーターでない方へ。<br>月300円で通信を応援いただくと、この会員ページ（花小金井まわりのおでかけカレンダーなど）もご利用いただけます。</p>
      <a class="join" href="https://note.com/bon_voyage_mail/membership" target="_blank" rel="noopener">サポーターになる（月300円）</a>
      <a class="more" href="/">まずは通信について知る →</a>
    </div>
  </div>
  <div id="content" hidden></div>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  応援サポーター向け会員ページ<br>
  <a href="/tokushoho.html">特定商取引法に基づく表記・免責事項</a>｜© 2026 ぼんぼやーじゅ通信
</footer>

<script>
const BLOBS = ${JSON.stringify(BLOBS)};
const ITER = ${ITER};
const b2u = (b) => Uint8Array.from(atob(b), c => c.charCodeAt(0));
async function deriveKey(pass, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:ITER, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
}
async function tryUnlock(pass){
  for (const blob of BLOBS){
    try {
      const key = await deriveKey(pass, b2u(blob.salt));
      const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b2u(blob.iv)}, key, b2u(blob.ct));
      return new TextDecoder().decode(pt);
    } catch(e) {}
  }
  return null;
}
function reveal(htmlStr){
  document.getElementById('content').innerHTML = htmlStr;
  document.getElementById('content').hidden = false;
  document.getElementById('gate').style.display = 'none';
  enableNav();
}
function enableNav(){
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.style.display = 'block';
  let last = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < 140) nav.classList.remove('show');        // 最上部付近: ヘッダーが見えるので隠す
    else if (y < last - 2) nav.classList.add('show'); // 上にスクロール(戻る)で表示
    else if (y > last + 2) nav.classList.remove('show'); // 下にスクロールで隠す
    last = y;
  }, { passive: true });
}
async function attempt(pass, remember){
  pass = (pass || '').normalize('NFC');
  const html = await tryUnlock(pass);
  if (html){ if(remember) sessionStorage.setItem('bv_pw', pass); reveal(html); return true; }
  return false;
}
document.getElementById('go').addEventListener('click', async () => {
  const pw = document.getElementById('pw').value.trim();
  document.getElementById('err').textContent = '';
  if (!pw) return;
  const ok = await attempt(pw, true);
  if (!ok) document.getElementById('err').textContent = '合言葉が違うようです。もう一度お試しください。';
});
document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('go').click(); });
(async () => { const s = sessionStorage.getItem('bv_pw'); if (s) await attempt(s, false); })();
</script>
</body>
</html>`;

writeFileSync(OUT, page);
console.log('wrote', OUT, page.length, 'chars; passphrases:', PASSES.length, '(暗号文のみ出力・合言葉は非保存)');
