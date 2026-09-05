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
];

const page = (v) => `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ぼんぼやーじゅ通信｜LINEで友だち追加</title>
<!-- 自動生成: scripts/build-flyer-landings.mjs
     配布先「${v.label}」の流入計測用。印字URL: bonvoya.nicomaru.tokyo/f/${v.code}
     読者から見える中身は /f と同じ。違うのはURLだけ（＝解析でパスごとに数えるため）。 -->
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
  <div class="sub">花小金井まわりの 週末おでかけ便</div>
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
