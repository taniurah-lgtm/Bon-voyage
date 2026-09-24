#!/usr/bin/env node
/**
 * 配布先ごとの流入計測用ランディングを作る。
 *
 *   docs/homepage/f/<code>/index.html   … 印字URL bonvoya.nicomaru.tokyo/f/<code>
 *
 * 中身は /f と同じ（ホームページへ転送するだけ）。**違うのはURLだけ。**
 * アクセス解析はパスごとに集計するので、これで「どこに置いたチラシから来たか」が分かる。
 *
 * 解析は docs/homepage/assets/analytics.js に1行入れたときだけ動く（既定では何も送らない）。
 *
 * 使い方: node scripts/build-flyer-landings.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

// 配布先。code は短く・読める語に（解析画面でそのまま読むため）
// 🔴 2026-09-20: VENUES の label を、生成するHTMLのコメントに埋め込んでいた。
//   /f/hokenshi を開くと、ソースに
//   「配布先『保健師さんの新生児訪問（こども家庭センター経由・手渡し）』の流入計測用」
//   と書かれた状態で、誰でも読めた。
//   CLAUDE.md「🔒 公開物に書かないこと」= 計測の仕組み（配布先コード /f/xxx の一覧、解析の設定）。
//   **市の課との配布の取り決めが、そのまま外に出ていた。**
//   build-members.mjs でも同じことをやって直したばかり（HTMLコメントは公開ファイルの一部）。
//   → label はここ（JS）だけで使う。生成物には code も label も書かない。
//   読者から見える中身は /f と同じで、違うのはURLだけ（解析でパスごとに数えるため）。
const VENUES = [
  { code: 'asupia',   label: '小平市民活動支援センター あすぴあ' },
  { code: 'kodomo',   label: '子ども家庭支援センター おひさまひろば' },
  { code: 'rokuto',   label: '多摩六都科学館' },
  { code: 'seibu',    label: 'せいぶ通り商店会（加盟店）' },
  { code: 'kominkan-n', label: '花小金井北公民館' },
  { code: 'kominkan-s', label: '花小金井南公民館' },
  { code: 'library',  label: '小平市立図書館' },
  { code: 'jidokan',  label: '児童館' },
  { code: 'poster',   label: 'ポスター掲示（場所を問わない共通枠）' },
  { code: 'hand',     label: '手渡し・口コミ' },
  { code: 'kraft',    label: 'クラフト紙チラシ（黒1色・A4）' },
  { code: 'clinic',   label: '小児科・小児歯科の待合' },
  { code: 'hokenshi', label: '保健師さんの新生児訪問（こども家庭センター経由・手渡し）' },
  { code: 'en',       label: '私立の保育園・幼稚園の玄関' },
  // 2026-09-24: 園の連絡アプリの「保護者からのお便り」で本文リンク＋PDFを配る経路。
  //   紙の棚（en）とは届く範囲がまったく違う（全家庭のスマホに届く）ので分けて数える。
  { code: 'app',      label: '園の連絡アプリ（保護者からのお便り）' },
  { code: 'cook',     label: '家庭料理教室（掲載先から生徒さんへ）' },
];

const page = (v) => `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ぼんぼやーじゅ通信｜LINEで友だち追加</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;background:#FBFAF5;color:#34434C;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;}
.card{max-width:420px;width:100%;}
.brand{font-size:26px;font-weight:800;letter-spacing:1px;color:#2C7C9E;}
.sub{font-size:15px;color:#63727B;margin-top:6px;}
.lead{font-size:17px;line-height:1.6;margin:22px 0 20px;}
.btn{display:inline-block;background:#2C7C9E;color:#fff;font-size:19px;font-weight:800;text-decoration:none;border-radius:999px;padding:16px 40px;box-shadow:0 8px 22px rgba(44,124,158,.28);}
.hint{font-size:13px;color:#8a97a0;margin-top:16px;line-height:1.6;}
</style>
</head><body>
<div class="card">
  <div class="brand">ぼんぼやーじゅ通信</div>
  <div class="sub">小平の 週末おでかけ便</div>
  <div class="lead">未就学児・小学生のいるご家庭へ🎈<br>週末のおでかけ情報を、毎週おとどけしています。<br>まずはどんな通信か、ホームページでのぞいてみてください。</div>
  <a class="btn" id="go" href="/?from=${v.code}">ホームページを見る →</a>
  <div class="hint">自動でうつらない場合は、上のボタンを押してください。</div>
</div>
<script src="/assets/analytics.js"></script>
<script>
  try { localStorage.setItem('bv_from', '${v.code}'); localStorage.setItem('bv_from_at', new Date().toISOString()); } catch (e) {}
  // 解析が拾えるよう少し待ってから転送する
  setTimeout(function(){ location.href = '/?from=${v.code}'; }, 1200);
</script>
</body></html>
`;

for (const v of VENUES) {
  mkdirSync(`docs/homepage/f/${v.code}`, { recursive: true });
  writeFileSync(`docs/homepage/f/${v.code}/index.html`, page(v));
  console.log(`  /f/${v.code}  ← ${v.label}`);
}
console.log(`\n${VENUES.length}件のランディングを生成しました。`);

// ─────────────────────────────────────────────────────────────
// SNSのプロフィール欄に置くリンク
//
// ★なぜ別に要るか: アプリの中のブラウザは、リンクを踏んでも
//   リファラを送らないことがある。とくに**プロフィール欄のリンク**は落ちやすく、
//   落ちると解析では「direct」に混ざって、紙のQRと見分けがつかなくなる。
//   投稿の中に貼ったURLはリファラが残ることが多いので、
//   **プロフィール欄のぶんだけ**専用のパスにして、パスの数で数える。
//
// ★追跡パラメータ（?utm_...）は使わない（2026-09-09 決定・docs/tracking.md）。
//   これは query ではなく**ただのパス**なので、読む人に「集計しています」とは見えない。
//
// ★/f/ と違って**見せる紙面が無い**（プロフィールから来た人はサイトを見に来ている）。
//   なので中身は出さず、すぐ転送する。待たせない。
const SOCIAL = [
  { code: 'th', label: 'Threads プロフィール欄のリンク' },
  { code: 'ig', label: 'Instagram プロフィール欄のリンク' },
];

const jump = (v) => `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ぼんぼやーじゅ通信｜小平の週末おでかけ便</title>
<!-- Threadsのリンクカードはここを読む（転送のJSは実行されない）。ホームページと同じ見え方にそろえる -->
<!-- ★2026-09-24: 手で足したら、このスクリプトを回したときに消えた。ここで出す -->
<meta name="description" content="小平市の未就学児〜小学生のいるご家庭へ。週末のおでかけ情報を毎週水曜に無料でお届けします。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://bonvoya.nicomaru.tokyo/">
<meta property="og:title" content="ぼんぼやーじゅ通信｜小平の週末おでかけ便">
<meta property="og:description" content="小平市の未就学〜小学生のいるご家庭へ、週末のおでかけ情報を毎週水曜に無料でお届け。">
<meta property="og:image" content="https://bonvoya.nicomaru.tokyo/assets/hero-park.jpg">
<meta property="og:locale" content="ja_JP">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#FBFAF5;color:#63727B;
  font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;font-size:15px;}
a{color:#2C7C9E;}
</style>
</head><body>
<p>ひらいています… <a href="/">ひらかない場合はこちら</a></p>
<script src="/assets/analytics.js"></script>
<script>
  // 解析が1回ぶん送れるだけ待って、すぐ行く（待たせない）
  setTimeout(function(){ location.replace('/'); }, 400);
</script>
</body></html>
`;

for (const v of SOCIAL) {
  mkdirSync(`docs/homepage/${v.code}`, { recursive: true });
  writeFileSync(`docs/homepage/${v.code}/index.html`, jump(v));
  console.log(`  /${v.code}  ← ${v.label}`);
}
