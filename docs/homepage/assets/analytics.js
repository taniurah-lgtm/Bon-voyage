/* アクセス解析（Cookieを使わない）。 */
(function () {
  var SITE = 'bonvoya';          // https://bonvoya.goatcounter.com（2026-09-06 有効化）
  if (!SITE) return;

  var s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = 'https://' + SITE + '.goatcounter.com/count';
  s.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(s);
})();
