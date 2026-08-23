#!/usr/bin/env node
/*
 * 会員ページを「合言葉ゲート＋中身をAES-GCM暗号化」でビルドする。
 *   MEMBER_PASS=xxx [INSIDER_PASS=yyy] node scripts/build-members.mjs
 *
 * 入力:
 *   data/events.json    … 台帳から起こした全件（scripts/build-events-json.mjs が作る）
 *   data/map-posts.json … 承認済みのみんなの投稿（会員ページは全件・写真つきも出す）
 *   data/map-spots.json … スポット（会員ページの地図に使う）
 * 出力:
 *   docs/homepage/m/s7f2ka/index.html
 *
 * 合言葉はリポジトリに保存しない（暗号文だけ出力）。ブラウザのWeb Cryptoで復号する。
 *
 * カレンダーの中身は **暗号化した中身の中の JSON** に入れる。
 * 描画のコード（/assets/bv-calendar.js）は公開されるが、予定の中身は入っていないので、
 * 合言葉を知らない人には先の予定は見えない。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { encryptFor, passphrases, ITER, CLIENT_DECRYPT, jsonInTag, esc, buildStamp } from './lib/gate.mjs';

const OUT = 'docs/homepage/m/s7f2ka/index.html';
const EVENTS = JSON.parse(readFileSync('data/events.json', 'utf8'));
const POSTS = JSON.parse(readFileSync('data/map-posts.json', 'utf8'));
const SPOTS = JSON.parse(readFileSync('data/map-spots.json', 'utf8'));

const PASSES = passphrases();
// 投稿の送り先があるかどうかで案内を変える。
// ★ここを切り替えていなかったため、月300円を払った人だけが見るページで
//   「公開ページのフォームから」と、無いフォームを案内していた（事故#7と同型）。
const CAN_POST = !!process.env.MAP_POST_URL;

// ---- カレンダーに渡すデータ（台帳の内部メモは落として渡す）--------------------
const calData = {
  generated: EVENTS.generated,
  events: EVENTS.events.map((e) => ({
    id: e.id, name: e.name, dates: e.dates, span: e.span, when: e.when,
    start: e.start, end: e.end, place: e.place, mapq: e.mapq,
    summary: e.summary, kidsNote: e.kidsNote, ages: e.ages,
    cost: e.cost, target: e.target, url: e.url,
    caution: e.caution, hours: e.hours, contact: e.contact, exceptions: e.exceptions,
    lastEntry: e.lastEntry, totalDates: e.totalDates, programs: e.programs,
    tentative: e.tentative, timeUncertain: e.timeUncertain, deadline: e.deadline,
  })),
  standing: EVENTS.standing,
};

// ★写し忘れの見張り。
//   timeUncertain を写し忘れていたせいで、「時間は要確認（例年の目安）」のバッジと
//   カレンダー登録時の警告が、月300円を払った会員ページだけで消えていた
//   （無料の人には出るのに、有料の人の予定表に未確定の時刻が黙って入る）。
//   同じ事故を二度やらないよう、カレンダー側が読むキーが全部揃っているか毎回確かめる。
//   ★見張りは ev. だけでなく e. / s. も見る。カレンダー側は場所によって
//     ev.timeUncertain / e.contact / s.name と書き分けており、ev. しか見ないと
//     締切の電話（contact）や会期もの（span）を落としても素通りしていた
//     （再発防止の仕組みが再発を許す形になっていた）。
{
  const js = readFileSync('docs/homepage/assets/bv-calendar.js', 'utf8');
  // 短い変数名は他の用途とも衝突するので、台帳に無いものは無視する
  const LEDGER_KEYS = new Set(Object.keys(EVENTS.events[0] || {}));
  const read = new Set(
    [...js.matchAll(/\b(?:ev|e|s)\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]).filter((k) => LEDGER_KEYS.has(k))
  );
  // 先頭1件だけ見ると、その件に無いキー（span など）を見落とす。全件の和集合で見る。
  const have = new Set(calData.events.flatMap((e) => Object.keys(e)));
  const missing = [...read].filter((k) => !have.has(k));
  if (missing.length) {
    console.error('🔴 bv-calendar.js が読むのに、会員ページへ渡していないキー: ' + missing.join(', '));
    console.error('   → scripts/build-members.mjs の calData.events の写しに足すこと。');
    process.exit(1);
  }
  console.log(`  写し漏れの見張り: カレンダーが読む ${read.size}キーすべて渡している`);
}

// ---- 連休さきどり（手で書いている枠。テーマ別・キャンプ偏重にしない）----------
const renkyu = `
  <h2 class="sec" id="renkyu">🍁 連休さきどり（9/19〜23 シルバーウィーク）</h2>
  <p class="sec-note">花小金井から日帰り〜1泊で行ける秋の連休を、テーマ別に。人気の宿・体験は早めに。</p>
  <div class="ev"><div class="nm">🍇 秋の味覚狩り（ぶどう＆芋）</div><div class="desc">小松沢レジャー農園（秩父・横瀬／西武秩父線・横瀬駅から無料送迎バス）＝ぶどう狩り（例年8月中旬〜11月上旬）＋さつま芋掘り（例年9月下旬〜）＋マスつかみ。屋根つき体験多めで2歳連れも◎。ぶどうは山梨・勝沼も名産。※開催時期・料金は公式で確認を。</div><div class="links"><a class="lk map" href="https://www.google.com/maps/search/?api=1&amp;query=小松沢レジャー農園" target="_blank" rel="noopener">📍 地図</a><a class="lk off" href="https://www.komatsuzawa.co.jp/" target="_blank" rel="noopener">🔗 公式</a></div></div>
  <div class="ev"><div class="nm">🏞 高原で涼む・自然（1泊向き）</div><div class="desc">清里/八ヶ岳・富士五湖ほか。標高が高く涼しく、牧場で動物ふれあいも。人気宿は連休ぶんが早く埋まるので早めに。</div></div>
  <div class="ev"><div class="nm">♨ 子連れ温泉（1泊・のんびり）</div><div class="desc">秩父/奥多摩/箱根の子連れ歓迎の宿。部屋食・貸切風呂だと2歳連れも安心。連休は満室が早いので今のうちに候補押さえを。</div></div>
  <div class="ev"><div class="nm">🎠 雨でも安心のテーマパーク・室内</div><div class="desc">サンリオピューロランド（多摩・全天候の室内）は天気に左右されない。西武園ゆうえんち（近い）は大火祭りの花火が9/19〜23も開催。</div><div class="links"><a class="lk off" href="https://www.puroland.jp/" target="_blank" rel="noopener">🔗 ピューロランド</a><a class="lk off" href="https://www.seibuen-amusement-park.jp/2026summer/" target="_blank" rel="noopener">🔗 西武園</a></div></div>
  <div class="ev"><div class="nm">🏕 キャンプ（早めに予約）</div><div class="desc">C&amp;C山中湖ほか高原キャンプ。予約は例年2ヶ月前の月末20時ごろ開始（9月分は7月末ごろ）。人気なので、最新の受付日を公式で確認して早めに。日曜泊やキャンセル拾いも。</div><div class="links"><a class="lk off" href="https://www.camp-cabins.com/yamanakako/" target="_blank" rel="noopener">🔗 公式</a></div></div>
  <p class="note">※営業日・料金・味覚狩りの解禁時期は変わります。おでかけ前に各公式でご確認を。</p>`;

// ---- バックナンバー（過去号を実際に載せる）------------------------------------
// これまで「順次公開していきます」と書いてあるだけで中身が無かった。
// reports/free/ に実物があるので、そのまま読める形で入れる（できていないことを書かない）。
const issues = existsSync('reports/free')
  ? readdirSync('reports/free')
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))   // _draft- は除く
      .sort()
      .reverse()
  : [];

// 過去号は原文のまま置くが、あとで取り下げた記載には訂正を添える。
// ★事故#7「実装していない『カレンダー登録代行』を特典に書いていた」は撤回済みだが、
//   当時の号にはそのまま残っている。有料会員が読む生きたページなので、訂正なしで置けない。
const CORRECTIONS = [
  [/登録代行|登録を代行/, 'この号にある「カレンダー登録の代行」は、その後**ワンタップでご自分のカレンダーに保存いただく形**に変わりました。運営が代わりに登録することはしていません。'],
  [/わき水広場/, 'この号でご紹介した小金井公園「わき水広場」は、その後の確認で**実在が確かめられなかった**ため、掲載を取り下げました。'],
];

// 号の本文に混ざっていた作業用の行を落とす（`</content>` が読者に見えていた）
const stripArtifacts = (body) =>
  body
    .split('\n')
    .filter((l) => !/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(l))
    .join('\n')
    .trim();

const issueHTML = issues
  .map((f) => {
    const raw = readFileSync(`reports/free/${f}`, 'utf8');
    const [y, m, d] = f.replace('.md', '').split('-').map(Number);
    const wd = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    // 1行目の題名は日付が入っているので、見出しは自分で組む
    const body = stripArtifacts(raw.split('\n').slice(1).join('\n'));
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
    return `  <details class="issue">
    <summary>${m}月${d}日(${wd})号${fixes.length ? '<span class="issue-hasfix">訂正あり</span>' : ''}</summary>
    <div class="issue-body">${fixes.join('')}${linked}</div>
  </details>`;
  })
  .join('\n');

// ---- みんなの声（会員ページは全件・写真つきも出す）----------------------------
const voiceHTML = (p) =>
  `<div class="voice"><div class="vtxt">${esc(p.text)}</div>` +
  (p.photo ? `<img class="vimg" src="${esc(p.photo)}" alt="${esc(p.spot)}のようす" loading="lazy">` : '') +
  `<div class="vwho">— ${esc(p.who || 'ご近所の方')}${p.date ? `・${esc(p.date)}` : ''}${
    p.spot ? `・${esc(p.spot)}` : ''
  }</div></div>`;

const voicesSection = POSTS.length
  ? `<p class="sec-note">公開ページは各スポット2件までですが、ここでは全${POSTS.length}件を写真つきでご覧いただけます。</p>
  <div class="voices">${POSTS.map(voiceHTML).join('')}</div>`
  : `<div class="card"><p>みんなの声は、まだ集まりはじめたところです。<b>いま届いている投稿はありません。</b></p>
    <p class="note" style="margin-top:.5rem">投稿が入ったら、ここに全件（写真つきのものも）出ます。公開ページは各スポット2件までです。</p></div>`;

// ---- 暗号化する中身 -----------------------------------------------------------
const TOC = `
  <nav class="toc" aria-label="このページの中身">
    <a href="#cal">📅 カレンダー</a>
    <a href="#map">🗺 マップ</a>
    <a href="#renkyu">🍁 連休さきどり</a>
    <a href="#voices">💬 みんなの声</a>
    <a href="#back">📮 バックナンバー</a>
  </nav>`;

const CONTENT = `
  <h2 class="sec sec-first" id="cal">📅 おでかけカレンダー</h2>
  <p class="sec-note">日をタップすると予定が出ます。</p>
  <script type="application/json" id="bv-cal-data">${jsonInTag(calData)}</script>
  <div id="bv-cal"><p class="note">カレンダーを組み立てています…</p></div>

${TOC}

  <h2 class="sec" id="map">🗺 みんなのおでかけマップ</h2>
  <p class="sec-note">ピンをタップすると、その場所を地図で開けます。公開ページと同じ地図ですが、こちらはみんなの声が全件つきます。</p>
  <script type="application/json" id="bv-spots">${jsonInTag(SPOTS)}</script>
  <script type="application/json" id="bv-posts">${jsonInTag(POSTS)}</script>
  <div id="bv-map"><p class="note">地図を読み込んでいます…</p></div>
  <p class="note" style="margin-top:.6rem">${
    CAN_POST
      ? '投稿は <a href="/map.html#post">公開ページのフォーム</a> から。ひとことの長さはどなたも同じで、<b>合言葉を入れると写真も添えられます</b>（このページを開いていれば、合言葉は入力済みです）。'
      // 文中の「LINE」だけがリンク（33x16px）で、公開ページ側のボタン（143x60px）より
      // 押しにくかった。有料のページのほうが押しにくいのはおかしい。
      : '投稿は、いまは LINE でお預かりしています。場所とひとことを送っていただければ、こちらで地図に載せます。写真もいっしょに送っていただけます。' +
        '<span class="note-btns"><a class="note-btn" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINEで送る</a>' +
        '<a class="note-btn" href="mailto:nico25akmr@outlook.jp?subject=' + encodeURIComponent('おでかけマップへの投稿') + '">メールで送る</a></span>'
  }</p>

${renkyu}

  <h2 class="sec" id="voices">💬 みんなの声（全件）</h2>
  ${voicesSection}

  <h2 class="sec" id="back">📮 通信バックナンバー</h2>
  <p class="sec-note">${
    issues.length
      ? `これまでにお届けした${issues.length}号を、新しい順に置いています。題名をタップすると本文が開きます。`
      : 'まだ置いてある号がありません。最新号は毎週水曜にLINEでお届けしています。'
  }</p>
${issueHTML}

  <p class="note" style="margin-top:1.6rem">📅 ボタンはご自分のカレンダーに保存する形です（Googleカレンダー、またはiPhoneのカレンダー）。リマインダーはカレンダー側でお好みに設定できます。日程・料金は変わることがあるので、おでかけ前に各公式でご確認ください。</p>`;

// ---- ページ本体のCSS（カレンダー・地図の見た目は外部ファイル）------------------
const CSS = `:root{--ground:#FBFAF5;--surface:#FFFFFF;--surface-2:#F5F2EA;--ink:#34434C;--ink-soft:#63727B;--ink-faint:#97A2AA;--sky:#4FA3C4;--sky-deep:#2C7C9E;--sky-wash:#E9F4F7;--marigold:#EBA24A;--marigold-wash:#FBEEDA;--marigold-ink:#8A5A12;--on-sky:#FFFFFF;--danger-ink:#B4453C;--leaf:#74AE71;--line:#ECE7DB;--line-strong:#DCD5C6;--radius:18px;--radius-sm:14px;--shadow-soft:0 2px 20px rgba(52,67,76,.05);--maru:"Hiragino Maru Gothic ProN","Yu Gothic","Noto Sans JP","Segoe UI",sans-serif;--body:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP","Segoe UI",Meiryo,sans-serif;--script:Georgia,"Times New Roman",serif;}
@media (prefers-color-scheme:dark){:root{--ground:#131F28;--surface:#1A2831;--surface-2:#21333D;--ink:#ECF2F4;--ink-soft:#AAB9C1;--ink-faint:#7B8C95;--sky:#6FBAD9;--sky-deep:#9AD4EA;--sky-wash:#1D3944;--marigold:#F0AE5E;--marigold-wash:#362F1F;--marigold-ink:#F0AE5E;--on-sky:#0E1A22;--danger-ink:#F2938A;--leaf:#8FC489;--line:#293B45;--line-strong:#38505C;--shadow-soft:0 2px 22px rgba(0,0,0,.22);}}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--body);line-height:1.8;-webkit-font-smoothing:antialiased;font-feature-settings:"palt" 1;}
.nav{position:fixed;top:0;left:0;right:0;z-index:600;background:var(--surface);border-bottom:1px solid var(--line);box-shadow:0 3px 14px rgba(52,67,76,.10);transform:translateY(-100%);transition:transform .25s ease;}
.nav.show{transform:translateY(0);}
.nav-in{max-width:44rem;margin:0 auto;display:flex;justify-content:center;gap:.3rem;padding:.5rem .5rem;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.nav-in::-webkit-scrollbar{display:none;}
.nav-in a{flex:none;font-size:.8rem;font-weight:700;color:var(--ink-soft);text-decoration:none;padding:.4rem .62rem;border-radius:999px;background:var(--surface-2);white-space:nowrap;}
.toc{display:flex;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:.45rem;margin:.3rem 0 1rem;padding:0 0 .2rem;scrollbar-width:none;}
.toc::-webkit-scrollbar{display:none;}
.toc a{flex:0 0 auto;white-space:nowrap;}
.toc a{font-size:.85rem;font-weight:700;color:var(--sky-deep);text-decoration:none;background:var(--sky-wash);border:1px solid var(--line);border-radius:999px;padding:.4rem .85rem;}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem;}
a{color:var(--sky-deep);}
header.h{background:linear-gradient(160deg,var(--sky-wash),var(--marigold-wash));border-bottom:1px solid var(--line);}
.h-in{max-width:44rem;margin:0 auto;padding:1rem 1.25rem .75rem;}
.eyebrow{font-family:var(--script);font-style:italic;color:var(--marigold);font-size:1rem;}
h1{font-family:var(--maru);font-weight:800;font-size:1.35rem;margin:.1rem 0 .25rem;letter-spacing:.02em;}
.h-in .sub{color:var(--ink-soft);font-size:.93rem;margin:0;}
main{padding:1.6rem 0 1rem;}
h2.sec{font-family:var(--maru);font-weight:800;font-size:1.2rem;margin:2.2rem 0 .3rem;display:flex;align-items:center;gap:.4rem;scroll-margin-top:3.6rem;}
/* 最初の見出しだけ詰める。カレンダーの表が初回スクロールなしで見えるように。 */
h2.sec-first{margin-top:.4rem;}
.sec-first + .sec-note{margin-bottom:.2rem;}
.noscript-note{background:var(--marigold-wash);border:1px solid var(--marigold);border-radius:12px;padding:.9rem 1rem;font-size:.86rem;line-height:1.8;margin:.6rem 0;}
.sec-note{color:var(--ink-soft);font-size:.9rem;margin:0 0 1rem;line-height:1.8;}
.ev{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:.95rem 1.1rem;margin-bottom:.8rem;box-shadow:0 2px 14px rgba(52,67,76,.05);}
.ev .when{color:var(--sky-deep);font-size:.82rem;font-weight:800;}
.ev .nm{font-family:var(--maru);font-weight:800;font-size:1.04rem;margin-top:.1rem;}
.ev .desc{font-size:.92rem;color:var(--ink-soft);margin-top:.3rem;}
.links{margin-top:.6rem;display:flex;flex-wrap:wrap;gap:.45rem;}
.lk{display:inline-flex;align-items:center;gap:.25rem;font-size:.8rem;font-weight:700;text-decoration:none;border-radius:999px;padding:.35rem .75rem;border:1px solid var(--line-strong);}
.lk.cal{background:var(--sky-deep);color:#fff;border-color:var(--sky-deep);}
.lk.map{color:var(--sky-deep);background:var(--surface);}
.lk.off{color:var(--marigold-ink);background:var(--surface);}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.15rem;}
.card ul{margin:.2rem 0 0;padding-left:1.1rem;} .card li{font-size:.94rem;margin:.2rem 0;}
.card p{margin:0;font-size:.94rem;}
.voices{display:flex;flex-direction:column;gap:.7rem;}
.voice{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:.8rem .95rem;}
.vtxt{font-size:.94rem;line-height:1.75;}
.vimg{display:block;max-width:100%;border-radius:12px;margin:.5rem 0 .2rem;}
.vwho{font-size:.8rem;color:var(--ink-faint);margin-top:.25rem;}
.note{font-size:.82rem;color:var(--ink-soft);line-height:1.75;}
.note-btns{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem;}
.note-btn{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border-radius:999px;
  border:1px solid var(--line-strong);background:var(--surface);font-weight:700;font-size:.86rem;text-decoration:none;}
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
.gate .more{display:inline-block;margin-top:.75rem;font-size:.82rem;color:var(--sky-deep);text-decoration:none;}
.gate .peek{margin-top:1rem;font-size:.82rem;color:var(--ink-faint);}
.gate .peek a{font-weight:700;}
.issue{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:.5rem;}
.issue>summary{font-family:var(--maru);font-weight:800;font-size:.96rem;color:var(--sky-deep);cursor:pointer;padding:.85rem 1.05rem;list-style:none;min-height:44px;display:flex;align-items:center;}
.issue>summary::marker,.issue>summary::-webkit-details-marker{display:none;}
.issue>summary::before{content:"＋ ";}
.issue[open]>summary::before{content:"− ";}
.issue-fix{background:var(--marigold-wash);border:1px solid var(--marigold);border-radius:10px;padding:.6rem .8rem;margin:0 0 .8rem;font-family:var(--body);font-size:.85rem;line-height:1.8;white-space:normal;}
.issue-hasfix{margin-left:.5rem;font-family:var(--body);font-weight:700;font-size:.7rem;color:var(--marigold-ink);background:var(--marigold-wash);border-radius:999px;padding:.05rem .5rem;}
.issue-body{margin:0;padding:0 1.05rem 1.05rem;overflow-wrap:anywhere;font-family:var(--body);font-size:.9rem;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink-soft);}
/* 公開3ページ（bv-tokens.css）と同じ拡大率にそろえる。ここが無いと会員ページだけ
   文字とタップ領域が小さくなる（root 16px / ボタン38px → 18px / 44px）。 */
@media (max-width:40rem){ html{font-size:112.5%;} .wrap,.h-in{padding-left:1.15rem;padding-right:1.15rem;} }
/* タップ領域の床。rem計算だけだと狭い画面で44pxを割る。 */
.lk,.toc a,.nav-in a{min-height:44px;display:inline-flex;align-items:center;}
.gate button{min-height:48px;}`;

const BLOBS = [];
for (const p of PASSES) BLOBS.push(await encryptFor(p, CONTENT));

const page = `<!doctype html>${buildStamp()}
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="robots" content="noindex, nofollow">
<title>会員ページ｜ぼんぼやーじゅ通信</title>
<link rel="stylesheet" href="/assets/leaflet/leaflet.css">
<link rel="stylesheet" href="/assets/bv-calendar.css">
<link rel="stylesheet" href="/assets/bv-map.css">
<style>${CSS}</style>
</head>
<body>
<header class="h" id="top"><div class="h-in">
  <div class="eyebrow">ぼんぼやーじゅ通信</div>
  <h1>会員ページ</h1>
  <p class="sub">応援サポーターの方へ。</p>
</div></header>
<nav id="nav" class="nav" style="display:none"><div class="nav-in">
  <a href="#top">ホーム</a>
  <a href="#cal">カレンダー</a>
  <a href="#map">マップ</a>
  <a href="#voices">みんなの声</a>
  <a href="#back">バックナンバー</a>
</div></nav>

<main class="wrap">
  <div id="gate" class="gate">
    <h2><label for="pw">🔑 合言葉を入力</label></h2>
    <p id="pw-help">会員の方にお伝えした合言葉を入れてください。</p>
    <!-- JavaScript を切っていると「ひらく」を押しても無反応のまま黙って終わる。
         公開ページには全部 noscript があるのに、お金をいただいている頁だけ
         行き止まりで沈黙するのはおかしい。 -->
    <noscript>
      <div class="noscript-note">このページは中身を合言葉で暗号化しているため、表示に JavaScript を使います。
        オフのままでは開けません。ブラウザの設定でオンにしてから読み込み直してください。
        うまくいかないときは <a href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE</a> か
        <a href="mailto:nico25akmr@outlook.jp">メール</a>でお知らせいただければ、その週のぶんをお送りします。</div>
    </noscript>
    <!-- autofocus は付けない。会員でない人がリンクを踏んだときにキーボードが開き、
         下の「サポーターになる」が隠れる（合言葉を持っていないのに入力を促される）。 -->
    <input id="pw" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="合言葉" aria-describedby="pw-help">
    <button id="go">ひらく</button>
    <div id="err" class="err"></div>
    <div class="hint">合言葉は、note のメンバー限定投稿でお知らせしています（LINEでお送りすることもできます）。分からないときはお気軽にお尋ねください。</div>
    <div class="cta">
      <p class="lead">まだサポーターでない方へ。<br>月300円で通信を応援いただくと、この会員ページ（花小金井まわりのおでかけカレンダーなど）もご利用いただけます。</p>
      <a class="join" href="https://note.com/bon_voyage_mail/membership" target="_blank" rel="noopener">サポーターになる（月300円）</a>
      <a class="more" href="/">まずは通信について知る →</a>
    </div>
    <p class="peek">カレンダーの雰囲気は、<a href="/calendar.html">公開版のおでかけカレンダー</a>（今日からの2週間ぶん）でご覧いただけます。</p>
  </div>
  <div id="content" hidden></div>
</main>

<footer>
  <div class="fmark">ぼんぼやーじゅ通信</div>
  応援サポーター向け会員ページ<br>
  <a href="/tokushoho.html">特定商取引法に基づく表記・免責事項</a>｜© 2026 ぼんぼやーじゅ通信
</footer>

<script src="/assets/leaflet/leaflet.js"></script>
<script src="/assets/bv-calendar.js"></script>
<script src="/assets/bv-map.js"></script>
<script>
const BLOBS = ${JSON.stringify(BLOBS)};
const ITER = ${ITER};
${CLIENT_DECRYPT}

function reveal(htmlStr){
  const box = document.getElementById('content');
  box.innerHTML = htmlStr;
  box.hidden = false;
  document.getElementById('gate').style.display = 'none';
  enableNav();
  // 中身は innerHTML で入れているので <script> は動かない。
  // 予定・スポットのデータは <script type="application/json"> から読み、描画はここで呼ぶ。
  buildCalendar();
  buildMap();
}

function readJSON(id){
  const el = document.getElementById(id);
  if (!el) return null;
  try { return JSON.parse(el.textContent); } catch(e){ return null; }
}

function buildCalendar(){
  const host = document.getElementById('bv-cal');
  const data = readJSON('bv-cal-data');
  if (!host) return;
  if (!data || !window.BVCalendar){ host.innerHTML = '<p class="note">カレンダーを組み立てられませんでした。ページを開き直してみてください。</p>'; return; }
  BVCalendar.mount(host, data, {});
}

function buildMap(){
  const host = document.getElementById('bv-map');
  if (!host) return;
  const spots = readJSON('bv-spots');
  const posts = readJSON('bv-posts') || [];
  if (!spots || !window.BVMap || !window.L){ host.innerHTML = '<p class="note">地図を読み込めませんでした。<a href="/map.html">公開ページのマップ</a>からご覧いただけます。</p>'; return; }
  // 会員ページにはスポット一覧の節が無いので、ふきだしの「くわしく ↓」は出さない
  // （出すと押しても何も起きず、履歴に # だけが積まれていた）。
  BVMap.mount(host, { spots: spots, posts: posts, hasList: false });
}

function enableNav(){
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.style.display = 'block';
  let last = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < 140) nav.classList.remove('show');           // 最上部付近: ヘッダーが見えるので隠す
    else if (y < last - 2) nav.classList.add('show');    // 上にスクロール(戻る)で表示
    else if (y > last + 2) nav.classList.remove('show'); // 下にスクロールで隠す
    last = y;
  }, { passive: true });
}
async function attempt(pass, remember){
  const html = await bvTryUnlock(pass, BLOBS, ITER);
  if (!html) return false;
  // ★合言葉の記憶は「できたら嬉しい」だけのもの。プライベートブラウズでは
  //   sessionStorage が例外を投げるので、ここで止まると正しい合言葉でも
  //   ページが永久に開かなくなる。失敗しても必ず reveal に進む。
  if (remember){
    try { sessionStorage.setItem('bv_pw', (pass||'').normalize('NFC')); } catch(e) {}
  }
  reveal(html);
  return true;
}
document.getElementById('go').addEventListener('click', async () => {
  const btn = document.getElementById('go');
  const pw = document.getElementById('pw').value.trim();
  document.getElementById('err').textContent = '';
  if (!pw) return;
  btn.disabled = true; btn.textContent = 'ひらいています…';
  const ok = await attempt(pw, true);
  if (!ok){
    btn.disabled = false; btn.textContent = 'ひらく';
    document.getElementById('err').textContent = '合言葉が違うようです。もう一度お試しください。';
  }
});
document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('go').click(); });
(async () => {
  let s = null;
  try { s = sessionStorage.getItem('bv_pw'); } catch(e) {}   // 読めない環境では素通り
  if (s) await attempt(s, false);
})();
</script>
</body>
</html>`;

writeFileSync(OUT, page);
const firm = EVENTS.events.filter((e) => !e.tentative).length;
console.log(`wrote ${OUT} ${page.length} chars`);
console.log(`  カレンダー: 確定 ${firm}件 / 暫定 ${EVENTS.events.length - firm}件 / 常設 ${EVENTS.standing.length}件`);
console.log(`  マップ: スポット ${SPOTS.length}件（ピン ${SPOTS.filter((s) => s.lat).length}件）/ みんなの声 ${POSTS.length}件`);
console.log(`  投稿の案内: ${CAN_POST ? 'サイト内フォーム' : 'LINEでお預かり'}`);
console.log(`  合言葉 ${PASSES.length}件（暗号文のみ出力・合言葉は非保存）${
  PASSES[0] === 'CHANGEME' ? '  ⚠ MEMBER_PASS 未設定' : ''
}`);
