#!/usr/bin/env node
/*
 * 「マップに投稿できます」という記述を、投稿の送り先があるかどうかで切り替える。
 *   node scripts/apply-post-mode.mjs docs/homepage/index.html
 *
 * MAP_POST_URL があれば data-bv-post="on" 側を、無ければ "off" 側を表示する。
 *
 * なぜ要るか:
 *   送り先が未設定のとき、サイト内フォームは出ず「LINEでお預かりしています」に
 *   差し替わる（bv-post.js）。ところがトップページには「このページから直接
 *   書き込めます」と書いたままだった。事故#7（実装していない「カレンダー登録代行」を
 *   特典に書いていた）と同じ型なので、書いてあることを実装に追随させる。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = process.argv[2];
if (!PATH) { console.error('使い方: node scripts/apply-post-mode.mjs <index.html>'); process.exit(2); }

const on = !!process.env.MAP_POST_URL;
let html = readFileSync(PATH, 'utf8');
let n = 0;

// data-bv-post="on" / "off" の hidden を付け外しする
html = html.replace(/(<[^>]*\bdata-bv-post="(on|off)"[^>]*>)/g, (tag, _all, mode) => {
  const shouldHide = on ? mode === 'off' : mode === 'on';
  let out = tag.replace(/\s+hidden(?==|\b)/g, '');
  if (shouldHide) out = out.replace(/>$/, ' hidden>');
  n++;
  return out;
});

// CI が「書いてあることと、できること」を照合するための印。
// ★可視テキストで grep すると、hidden にした側の文字列も引っかかって必ず落ちる
//   （実際にそうなっていた）。モードそのものを書き込んで、それを見てもらう。
html = html.replace(/\n?<!-- BV_POST_MODE: \w+ -->/g, '');
html = html.replace(/<\/body>/, `<!-- BV_POST_MODE: ${on ? 'on' : 'off'} -->\n</body>`);

writeFileSync(PATH, html);
console.log(`${PATH}: 投稿の記述を ${on ? '「サイト内で書ける」' : '「LINEでお預かり」'} に揃えた（${n}箇所）`);
if (!on) console.log('  ※ MAP_POST_URL を設定すると、サイト内フォームの記述に戻る');
