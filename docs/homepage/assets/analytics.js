/* アクセス解析（Cookieを使わない）。 */
(function () {
  var SITE = 'bonvoya';          // https://bonvoya.goatcounter.com（2026-09-06 有効化）
  if (!SITE) return;

  var s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = 'https://' + SITE + '.goatcounter.com/count';
  s.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(s);

  // 入口（/th・/ig・/f/xxx）を覚えておく。友だち追加がどこから来た人か分かるように（7日間）
  var m = location.pathname.match(/^\/(th|ig)\/?$/) || location.pathname.match(/^\/f\/([^\/]+)\/?$/);
  if (m) {
    try { localStorage.setItem('bv_from', m[1]); localStorage.setItem('bv_from_at', new Date().toISOString()); } catch (e) {}
  }

  // LINEの友だち追加ボタンが押された数（2026-10-15）。「LINE追加｜入口｜押したページ」で数える
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="lin.ee/"], a[href*="line.me/R/ti/"]') : null;
    if (!a || !window.goatcounter || !window.goatcounter.count) return;
    var from = '';
    try {
      var at = Date.parse(localStorage.getItem('bv_from_at') || '');
      if (at && Date.now() - at < 7 * 864e5) from = localStorage.getItem('bv_from') || '';
    } catch (err) {}
    window.goatcounter.count({
      path: 'LINE追加｜' + (from || '直接') + '｜' + (location.pathname.replace(/index\.html$/, '') || '/'),
      title: 'LINEの友だち追加ボタン',
      event: true
    });
  }, true);
})();
