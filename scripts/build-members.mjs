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
    rainDates: e.rainDates,
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
// ★終わった連休を「さきどり」として出し続けないよう、期限を持たせる。
//   9/24 になっても「9/19〜23をさきどり」と言い続けるのは、有料ページとして雑。
const RENKYU_TO = '2026-09-23';
const TODAY_JST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const renkyuLive = RENKYU_TO >= TODAY_JST;
const renkyu = !renkyuLive ? '' : `
  <h2 class="sec" id="renkyu">🍁 連休さきどり（9/19〜23 シルバーウィーク）</h2>
  <p class="sec-note">花小金井から日帰り〜1泊で行ける秋の連休を、テーマ別に。人気の宿・体験は早めに。</p>
  <div class="ev"><div class="nm">🍇 秋の味覚狩り（ぶどう＆芋）</div><div class="desc">小松沢レジャー農園（秩父・横瀬／西武秩父線・横瀬駅から無料送迎バス）＝ぶどう狩り（例年8月中旬〜11月上旬）＋さつま芋掘り（例年9月下旬〜）＋マスつかみ。屋根つき体験多めで2歳連れも◎。ぶどうは山梨・勝沼も名産。※開催時期・料金は公式で確認を。</div><div class="links"><a class="lk map" href="https://www.google.com/maps/search/?api=1&amp;query=小松沢レジャー農園" target="_blank" rel="noopener">📍 地図</a><a class="lk off" href="https://www.komatsuzawa.co.jp/" target="_blank" rel="noopener">🔗 公式</a></div></div>
  <div class="ev"><div class="nm">🏞 高原で涼む・自然（1泊向き）</div><div class="desc">清里/八ヶ岳・富士五湖ほか。標高が高く涼しく、牧場で動物ふれあいも。人気宿は連休ぶんが早く埋まるので早めに。</div></div>
  <div class="ev"><div class="nm">♨ 子連れ温泉（1泊・のんびり）</div><div class="desc">秩父/奥多摩/箱根の子連れ歓迎の宿。部屋食・貸切風呂だと2歳連れも安心。連休は満室が早いので今のうちに候補押さえを。</div></div>
  <div class="ev"><div class="nm">🎠 雨でも安心のテーマパーク・室内</div><div class="desc">サンリオピューロランド（多摩・全天候の室内）は天気に左右されない。西武園ゆうえんち（近い）は大火祭りの花火が9/19〜23も開催。</div><div class="links"><a class="lk off" href="https://www.puroland.jp/" target="_blank" rel="noopener">🔗 ピューロランド</a><a class="lk off" href="https://www.seibuen-amusement-park.jp/2026summer/" target="_blank" rel="noopener">🔗 西武園</a></div></div>
  <div class="ev"><div class="nm">🏕 キャンプ（早めに予約）</div><div class="desc">高原キャンプは連休ぶんが早く埋まります。施設ごとの予約開始ルールは下の<a href="#camp">キャンプの節</a>にまとめています（取りにくいときは日曜泊とキャンセル待ち通知が有効）。</div></div>
  <p class="note">※営業日・料金・味覚狩りの解禁時期は変わります。おでかけ前に各公式でご確認を。</p>`;

// 号の本文に残る内部用語を、読者向けの言い方に直す。
// 「巡回」は運営側の作業名、「★駅前・地元」は台帳の絞り込みマーカーで、
// どちらも読む人には意味が通らない（原文をそのまま貼っているので残っていた）。
// 読者は「巡回」も「調べもの」もしない。運営側の作業名が残らないようにする。
const WORDS = [
  [/毎月中旬の巡回で/g, '毎月中旬に'],
  [/来月中旬の巡回で/g, '来月中旬に'],
  [/次回の巡回で/g, '次回のお便りで'],
  [/巡回で/g, 'こちらで'],
  [/巡回時に/g, 'おでかけ前に'],
  [/\s*★[^\s、。]*(?=\s|$)/g, ''],
];
const fixWords = (t) => WORDS.reduce((acc, [re, to]) => acc.replace(re, to), t);

// ---- キャンプ（events/camp.md を読む）----------------------------------------
// 特典に「キャンプ・連休の解禁日と締切を、先のぶんまで」と書いているのに、
// events/camp.md はビルドで一度も読まれておらず、会員ページのキャンプ欄は
// 手書きの1段落だけだった（しかも「9月分は7月末ごろ」＝今日にはもう過ぎている助言）。
// 台帳の中身をそのまま載せる。日付を勝手に計算はしない（台帳自身が
// 「ルールは変わるので各公式で再確認」と書いているため）。
const campSection = (() => {
  if (!existsSync('events/camp.md')) return '';
  const text = readFileSync('events/camp.md', 'utf8');
  const lines = text.split('\n');
  // 「予約の基本(重要)」の中身
  const basics = [];
  let inBasics = false;
  // 過ぎた日付を例に出さない。台帳の「9月分は7月末ごろ」は、今日(8月下旬)には
  // もう過ぎていて助言にならない。ルールだけ残して、例示の括弧は落とす。
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const thisMonth = Number(today.slice(5, 7));
  // 例示の中に「もう過ぎた月」が1つでもあれば、その例ごと落とす。
  //「9月分は7月末ごろ」は、7月末という受付開始日がすでに過ぎていて助言にならない
  //（ルール本体は括弧の外にあるので、落としても情報は減らない）。
  // 年をまたぐ月（12月に見る1〜3月など）を誤って落とさないよう、直近6ヶ月ぶんだけ見る。
  const isPastMonth = (n) => {
    const back = thisMonth - n;
    return back >= 1 && back <= 6;
  };
  // 括弧に入っていない「9月分は7月末ごろ」形も同じ理由で落とす
  const dropStalePhrase = (t) => t.replace(/[＝=]?\s*\d{1,2}月分は\d{1,2}月[^。、）)]*/g, (mm) => {
    const months = [...mm.matchAll(/(\d{1,2})月/g)].map((x) => Number(x[1]));
    return months.some(isPastMonth) ? '' : mm;
  });
  const dropStaleExample = (t) => t.replace(/\s*[（(]例[:：][^）)]*[）)]/g, (mm) => {
    const months = [...mm.matchAll(/(\d{1,2})月/g)].map((x) => Number(x[1]));
    return months.some(isPastMonth) ? '' : mm;
  });
  for (const l of lines) {
    if (/^##\s*予約の基本/.test(l)) { inBasics = true; continue; }
    if (inBasics && /^##\s/.test(l)) break;
    if (inBasics && /^\s*[-*+]\s/.test(l)) {
      basics.push(fixWords(dropStalePhrase(dropStaleExample(l.replace(/^\s*[-*+]\s*/, '')))));
    }
  }
  // 施設（### C<n>. 名前）
  // ★台帳の内部欄は公開しない。台帳は「わが家の作業メモ」なので、
  //   確度・ステータス・運営の判断・家族固有の記述がそのまま入っている。
  //   イベント側には FORBIDDEN の番兵があるのに、camp.md を直読みする経路には
  //   何も無く、17か所ぜんぶに「確度: 高 / ステータス: 候補」が露出していた。
  const CAMP_DROP = /^\s*[-*+]\s*(確度|ステータス|出典|備考|メモ)\s*[:：]/;
  // ★行ごと落としてはいけない。落とすべきは「わが家は5人だからちょうど上限」という
  //   家庭固有の解釈だけで、「1組最大5名(未就学児含む)」という施設の規約や
  //   「荒川は浅瀬でライフジャケット」という安全注意は読者に必要な情報。
  //   行ごと消していたため、C8 から予約上限と川遊びの注意が両方消えていた。
  const CAMP_PRIVATE_PHRASE = /[=＝][^。、]*?(?:5人家族|わが家|うちの子)[^。、]*/g;
  const CAMP_PRIVATE_LINE = /施主/;
  const stripPrivate = (t) => t
    // 「/ 確度: 高 / ステータス: 候補」のように行末にぶら下がっている形も落とす
    .replace(/\s*\/?\s*(確度|ステータス)\s*[:：][^\/]*(?=\/|$)/g, '')
    .replace(CAMP_PRIVATE_PHRASE, '')
    // ★URL末尾の「/」を食わないよう、区切りとしての「 / 」だけを狙う
    .replace(/\s+\/\s*$/, '')
    .trim();
  const spots = [];
  let cur = null;
  for (const l of lines) {
    const h = l.match(/^###\s*(C\d+)\.\s*(.+)$/);
    if (h) {
      // 見出しの ★内部マーカー は落とす（イベント側の parseHeading と同じ規則）
      cur = { id: h[1], name: h[2].replace(/\s*★.*$/, '').trim(), body: [], raw: [] };
      spots.push(cur);
      continue;
    }
    if (/^##\s/.test(l)) cur = null;
    if (cur && /^\s*[-*+]\s/.test(l)) {
      const body = l.replace(/^\s*[-*+]\s*/, '');
      cur.raw.push(body);                       // 見送り判定にはもとの文を使う
      if (CAMP_DROP.test(l)) continue;
      const cleaned = stripPrivate(body);
      if (!cleaned || CAMP_PRIVATE_LINE.test(cleaned)) continue;
      cur.body.push(cleaned);
    }
  }
  const md = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s、）)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const live = spots.filter((c) => !/ステータス\s*[:：]\s*\**\s*見送り/.test(c.raw.join(' ')));
  if (!live.length && !basics.length) return '';
  return `
  <h2 class="sec" id="camp">🏕 キャンプ（予約の解禁が早いもの）</h2>
  <p class="sec-note">人気の施設は夏〜秋の土曜が2〜3ヶ月前に埋まります。${live.length}か所と、
    施設ごとの予約開始ルールをそのまま置いています。<b>ルールは年ごとに変わるので、必ず各公式でご確認ください。</b></p>
  ${basics.length ? `<div class="card"><div class="nm">予約の基本</div><ul class="campbasics">${
    basics.map((t) => `<li>${md(t)}</li>`).join('')
  }</ul></div>` : ''}
  <details class="spotwrap">
    <summary>キャンプ場の一覧を読む（全${live.length}か所）</summary>
    <div class="spotlist">${live.map((c) => `
      <div class="spot">
        <div class="nm">${esc(c.name)}</div>
        <div class="desc">${c.body.filter((t) => !/^URL\s*[:：]/.test(t)).map((t) => md(fixWords(dropStalePhrase(dropStaleExample(t))))).join('<br>')}</div>
        ${(() => {
          const u = (c.body.join(' ').match(/https?:\/\/[^\s、）)]+/) || [])[0];
          return u ? `<div class="links"><a class="lk off" href="${esc(u)}" target="_blank" rel="noopener">🔗 公式</a></div>` : '';
        })()}
      </div>`).join('')}
    </div>
  </details>`;
})();

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
  [/有料版希望|フォームからどうぞ/, 'この号にある「フォームからどうぞ」のご案内は、いまは使っていません。応援のお申し込みは**note のメンバーシップに一本化**しています。'],
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
    const body = fixWords(stripArtifacts(raw.split('\n').slice(1).join('\n')));
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

// ---- スポット一覧（会員は全件・各スポットのみんなの声も全件）------------------
// 公開ページは23枚のスポットカード（説明文つき）を持っているのに、会員ページは
// 地図だけで説明文がどこにも出ず、公開ページへ戻る導線も無かった。
// 有料のページが無料の下位互換になっていたので、同じ一覧をこちらにも置く。
// id は bv-map.js の slug() と同じ規則にする（ふきだしの「くわしく ↓」の飛び先）。
const slug = (name) => 's-' + Buffer.from(name).toString('hex').slice(0, 12);
const spotsBySpot = new Map();
for (const p of POSTS) {
  if (!spotsBySpot.has(p.spot)) spotsBySpot.set(p.spot, []);
  spotsBySpot.get(p.spot).push(p);
}
const spotCard = (s) => {
  const mine = spotsBySpot.get(s.name) || [];
  let links = `<a class="lk map" href="${esc(s.map || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}`)}" target="_blank" rel="noopener">📍 地図</a>`;
  if (s.official) links += `<a class="lk off" href="${esc(s.official)}" target="_blank" rel="noopener">🔗 公式</a>`;
  return `  <div class="spot" id="${esc(slug(s.name))}" data-cat="${esc(s.cat)}">
    <div class="nm">${esc(s.name)}${s.lat ? '' : ' <span class="nopin">ピンなし</span>'}</div>
    ${s.access ? `<div class="acc">${esc(s.access)}</div>` : ''}
    <div class="desc">${esc(s.desc || '')}</div>
    ${s.ages ? `<div class="ages">${esc(s.ages)}</div>` : ''}
    <div class="links">${links}</div>
    ${mine.length ? `<div class="voices">${mine.map(voiceHTML).join('')}</div>` : ''}
  </div>`;
};
const spotCats = [...new Set(SPOTS.map((s) => s.cat))];
const spotList = spotCats
  .map((cat) => `  <h4 class="spot-cat">${esc(cat)}</h4>
${SPOTS.filter((s) => s.cat === cat).map(spotCard).join('\n')}`)
  .join('\n');

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
    ${renkyuLive ? '<a href="#renkyu">🍁 連休さきどり</a>' : ''}
    ${campSection ? '<a href="#camp">🏕 キャンプ</a>' : ''}
    <a href="#voices">💬 みんなの声</a>
    <a href="#back">📮 バックナンバー</a>
    <a href="#other">🔗 ほかのページ</a>
  </nav>`;

const CONTENT = `
  <h2 class="sec sec-first" id="cal">📅 おでかけカレンダー</h2>
  <p class="sec-note">日をタップすると予定が出ます。<span class="stamp">情報の更新日: ${EVENTS.generated}</span></p>
  <script type="application/json" id="bv-cal-data">${jsonInTag(calData)}</script>
  <div id="bv-cal"><p class="note">カレンダーを組み立てています…</p></div>

${TOC}

  <h2 class="sec" id="map">🗺 みんなのおでかけマップ</h2>
  <p class="sec-note">ピンをタップすると、その場所を地図で開けます。公開ページの地図に、みんなの声を全件つけたものです（公開ページは各スポット2件まで）。</p>
  <script type="application/json" id="bv-spots">${jsonInTag(SPOTS)}</script>
  <script type="application/json" id="bv-posts">${jsonInTag(POSTS)}</script>
  <div id="bv-map"><p class="note">地図を読み込んでいます…</p></div>
  <details class="spotwrap">
    <summary>スポットの説明を読む（全${SPOTS.length}件）</summary>
    <div class="spotlist" id="map-spotlist">
${spotList}
    </div>
  </details>
  <p class="note" style="margin-top:.6rem">${
    CAN_POST
      ? '投稿は <a href="/map.html#post">公開ページのフォーム</a> から。ひとことの長さはどなたも同じで、<b>合言葉を入れると写真も添えられます</b>（このページを開いていれば、合言葉は入力済みです）。'
      // 文中の「LINE」だけがリンク（33x16px）で、公開ページ側のボタン（143x60px）より
      // 押しにくかった。有料のページのほうが押しにくいのはおかしい。
      : '投稿は、いまは LINE でお預かりしています。場所とひとことを送っていただければ、こちらで地図に載せます。写真もいっしょに送っていただけます。' +
        '<span class="note-btns"><a class="note-btn" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINEで送る</a></span>'
  }</p>

${renkyu}

${campSection}

  <h2 class="sec" id="voices">💬 みんなの声（全件）</h2>
  ${voicesSection}

  <h2 class="sec" id="back">📮 無料通信のバックナンバー</h2>
  <p class="sec-note">${
    issues.length
      ? `無料通信（水曜）の${issues.length}号を、新しい順に置いています。題名をタップすると本文が開きます。`
      : 'まだ置いてある号がありません。最新号は毎週水曜にLINEでお届けしています。'
  }</p>
${issueHTML}

  <h2 class="sec" id="other">🔗 ほかのページ</h2>
  <p class="sec-note">無料でお使いいただけるページにも、ここから戻れます。</p>
  <p class="note-btns" style="margin-top:.2rem">
    <a class="note-btn" href="/">通信について</a>
    <a class="note-btn" href="/calendar.html">公開カレンダー</a>
    <a class="note-btn" href="/map.html">公開マップ</a>
    <a class="note-btn" href="/guide.html">おでかけガイド</a>
  </p>

  <p class="note" style="margin-top:1.6rem"><b>📅</b> は Google カレンダーに直接ひらく形、<b>📄</b> はカレンダーのファイル(.ics)を保存する形です（iPhone・Apple カレンダーの方は 📄、Android の方もどちらでも使えます）。リマインダーはカレンダー側でお好みに設定できます。日程・料金は変わることがあるので、おでかけ前に各公式でご確認ください。</p>`;

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
.stamp{display:inline-block;margin-left:.5rem;font-size:.8rem;color:var(--ink-soft);}
.ev{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:.95rem 1.1rem;margin-bottom:.8rem;box-shadow:0 2px 14px rgba(52,67,76,.05);}
.ev .when{color:var(--sky-deep);font-size:.82rem;font-weight:800;}
.ev .nm{font-family:var(--maru);font-weight:800;font-size:1.04rem;margin-top:.1rem;}
.ev .desc{font-size:.92rem;color:var(--ink-soft);margin-top:.3rem;}
.links{margin-top:.6rem;display:flex;flex-wrap:wrap;gap:.45rem;}
.lk{display:inline-flex;align-items:center;gap:.25rem;font-size:.8rem;font-weight:700;text-decoration:none;border-radius:999px;padding:.35rem .75rem;border:1px solid var(--line-strong);}
/* スポットの説明の一覧（公開ページと同じ内容＋みんなの声を全件） */
.spotwrap{margin-top:.9rem;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface);}
.spotwrap>summary{min-height:44px;display:flex;align-items:center;padding:0 1rem;font-family:var(--maru);font-weight:800;font-size:.92rem;cursor:pointer;}
.spotlist{padding:0 1rem 1rem;}
.spot-cat{font-family:var(--maru);font-weight:800;font-size:.88rem;color:var(--ink-soft);margin:1.1rem 0 .4rem;}
.spot{border-top:1px solid var(--line);padding:.8rem 0;}
.spot.is-hit{background:var(--sky-wash);border-radius:var(--radius-sm);padding-left:.6rem;padding-right:.6rem;}
.spot .nm{font-family:var(--maru);font-weight:800;font-size:.98rem;}
.spot .acc{font-size:.8rem;color:var(--ink-soft);margin-top:.15rem;}
.spot .desc{font-size:.88rem;color:var(--ink-soft);margin-top:.3rem;line-height:1.8;}
.spot .ages{font-size:.82rem;font-family:var(--maru);font-weight:700;margin-top:.3rem;}
.spot .links{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;}
.campbasics{margin:.4rem 0 0;padding-left:1.1rem;font-size:.86rem;color:var(--ink-soft);line-height:1.9;}
.campbasics li{margin-top:.3rem;}
.nopin{font-size:.72rem;font-weight:700;color:var(--marigold-ink);background:var(--marigold-wash);border-radius:999px;padding:.1rem .45rem;}
.lk.cal{background:var(--sky-deep);color:var(--on-sky);border-color:var(--sky-deep);}
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
footer{color:var(--ink-soft);font-size:.8rem;text-align:center;padding:2rem 1.25rem 3rem;line-height:1.7;}
.fmark{font-family:var(--maru);font-weight:800;color:var(--ink-soft);}
.gate{max-width:24rem;margin:3rem auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1.6rem 1.4rem;text-align:center;box-shadow:0 2px 16px rgba(52,67,76,.06);}
.gate h2{font-family:var(--maru);font-weight:800;font-size:1.15rem;margin:0 0 .4rem;}
.gate p{color:var(--ink-soft);font-size:.9rem;margin:0 0 1rem;}
.gate input{width:100%;font-size:1.05rem;padding:.7rem .8rem;border:1px solid var(--line-strong);border-radius:12px;background:var(--ground);color:var(--ink);}
.gate button{margin-top:.8rem;width:100%;font-family:var(--maru);font-weight:800;font-size:1.05rem;color:var(--on-sky);background:var(--sky-deep);border:none;border-radius:999px;padding:.75rem;cursor:pointer;}
.gate .err{color:#C0554E;font-size:.86rem;margin-top:.7rem;min-height:1.1em;}
.gate .hint{font-size:.8rem;color:var(--ink-soft);margin-top:.9rem;}
.gate .cta{margin-top:1.3rem;padding-top:1.15rem;border-top:1px solid var(--line);}
.gate .cta .lead{font-size:.85rem;color:var(--ink-soft);margin:0 0 .8rem;line-height:1.7;}
.gate .join{display:block;font-family:var(--maru);font-weight:800;font-size:1rem;color:#3a2408;background:var(--marigold);border:none;border-radius:999px;padding:.72rem;text-decoration:none;}
.gate .more{display:inline-block;margin-top:.75rem;font-size:.82rem;color:var(--sky-deep);text-decoration:none;}
.gate .peek{margin-top:1rem;font-size:.82rem;color:var(--ink-soft);}
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
        うまくいかないときは <a href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINE</a>でお知らせいただければ、その週のぶんをお送りします。</div>
    </noscript>
    <!-- autofocus は付けない。会員でない人がリンクを踏んだときにキーボードが開き、
         下の「サポーターになる」が隠れる（合言葉を持っていないのに入力を促される）。 -->
    <input id="pw" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="合言葉" aria-describedby="pw-help">
    <button id="go">ひらく</button>
    <div id="err" class="err" role="alert" aria-live="assertive"></div>
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
  // 解錠しても読み上げは何も言わず、フォーカスは body のままだった。
  // 中身の先頭に focus を移して「開いた」ことが分かるようにする。
  box.setAttribute('tabindex', '-1');
  try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
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
  // スポットの説明の一覧をこのページにも置いたので、ふきだしの「くわしく ↓」を出す。
  // 飛び先は閉じている <details> の中にあるので、開いてから飛ぶ（下の onJump）。
  BVMap.mount(host, {
    spots: spots, posts: posts, hasList: true,
    // 公開ページは絞り込みが下の一覧にも効くのに、会員ページは23件出たままだった。
    onSelect: function (cat) {
      // ★地図の一覧だけを絞る。#map-spotlist で範囲を切らないと、
      //   同じ class を使っているキャンプの一覧まで消える。
      var list = document.getElementById('map-spotlist');
      if (!list) return;
      list.querySelectorAll('.spot').forEach(function (s) {
        s.hidden = !!cat && s.dataset.cat !== cat;
      });
      list.querySelectorAll('.spot-cat').forEach(function (h) {
        h.hidden = !!cat && h.textContent.trim() !== cat;
      });
    },
  });
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
    // btn.disabled でフォーカスが飛んだままだと、次の入力にたどり着けない
    document.getElementById('pw').focus();
    document.getElementById('pw').select();
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
