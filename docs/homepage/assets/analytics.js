/* アクセス解析。既定では「何もしない」。
 *
 * 有効にするには、下の SITE を自分の GoatCounter のコードに書き換えるだけ。
 *   例: const SITE = 'bonvoya';   →  https://bonvoya.goatcounter.com
 *
 * GoatCounter を選んだ理由:
 *   - 無料（個人利用）
 *   - **Cookieを使わない・個人を追跡しない**。訪問者の識別子を保存しない
 *   - パスごとに集計するので /f/rokuto と /f/asupia が別の行として出る＝配布先ごとの効果が分かる
 *
 * SITE が空のあいだは <script> を1つも読み込まない。つまり**どこにも通信しない**。
 */
(function () {
  var SITE = '';                 // ← ここを埋めるまで、解析は動かない
  if (!SITE) return;

  var s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = 'https://' + SITE + '.goatcounter.com/count';
  s.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(s);
})();
