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

  // LINEの友だち追加ボタンが押された数（2026-10-15）。「LINE追加｜入口｜押したページ｜ボタンの場所」で数える
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="lin.ee/"], a[href*="line.me/R/ti/"]') : null;
    if (!a || !window.goatcounter || !window.goatcounter.count) return;
    var from = '';
    try {
      var at = Date.parse(localStorage.getItem('bv_from_at') || '');
      if (at && Date.now() - at < 7 * 864e5) from = localStorage.getItem('bv_from') || '';
    } catch (err) {}
    // 2026-10-17: どのボタンが押されたかも足す（上のバー／最初の画面／ページの下 など）
    var sec = a.closest('section[id]');
    var pos = a.classList.contains('bvnav-cta') ? '上のバー'
      : a.closest('.hero') ? '最初の画面'
      : a.classList.contains('bvc-invite-btn') ? 'カレンダーの案内'
      : sec ? ({ tomodachi: 'ページの下' }[sec.id] || sec.id) : 'ほか';
    window.goatcounter.count({
      path: 'LINE追加｜' + (from || '直接') + '｜' + (location.pathname.replace(/index\.html$/, '') || '/') + '｜' + pos,
      title: 'LINEの友だち追加ボタン',
      event: true
    });
  }, true);

  // 押されたリンクの題名は、見えている文字だけにする（2026-10-21）。
  // data-goatcounter-title が無いと count.js は中のHTMLを題名にするので、
  // 解析の画面に <span class="ig"> などがそのまま出ていた（「様子｜…」「週｜園庭開放」）
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-goatcounter-click]') : null;
    if (!el || el.dataset.goatcounterTitle) return;
    var parts = Array.prototype.map.call(el.childNodes, function (n) { return (n.textContent || '').trim(); });
    el.dataset.goatcounterTitle = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 100);
  }, true);
})();
