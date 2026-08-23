/* ぼんぼやーじゅ通信 — おでかけマップ（描画のみ）
 *
 *   BVMap.mount(el, { spots, posts, onSelect })
 *     spots … data/map-spots.json の中身（lat/lng があるものにピンを立てる）
 *     posts … みんなの声（spot 名でスポットに紐づく）。無くてよい
 *
 * Leaflet はリポジトリ内（/assets/leaflet/）から読む。CDNには依存しない。
 * 地図のタイルだけは OpenStreetMap から取る（地図なので外部からになる）。
 * ピンは画像を使わず CSS（divIcon）で描くので、カテゴリごとに色を変えられる。
 */
(function (global) {
  'use strict';

  // カテゴリ（先頭の絵文字）ごとのピンの色。知らないカテゴリは既定色。
  var COLORS = {
    '🌳': '#5C9E5A', // 公園
    '💧': '#3E9BC4', // 水あそび
    '☔': '#8A7BC8', // 屋内
    '🚃': '#D08A3C', // 電車でおでかけ
    '🐘': '#C4703E', // 動物
    '🎠': '#C75B8A', // 遊園地・プール
  };
  var DEFAULT_COLOR = '#2C7C9E';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mapURL(q) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function catKey(cat) {
    // 絵文字は複数コードポイントのことがあるので、先頭の1文字で見ない
    for (var k in COLORS) if (cat && cat.indexOf(k) === 0) return k;
    return null;
  }
  function colorFor(cat) {
    var k = catKey(cat);
    return k ? COLORS[k] : DEFAULT_COLOR;
  }

  function mount(el, opts) {
    opts = opts || {};
    var spots = opts.spots || [];
    var posts = opts.posts || [];
    if (!global.L) {
      el.innerHTML = '<p class="bvm-fail">地図を読み込めませんでした。下の一覧からお探しください。</p>';
      return null;
    }

    var pinned = spots.filter(function (s) {
      return typeof s.lat === 'number' && typeof s.lng === 'number';
    });
    if (!pinned.length) {
      el.innerHTML = '<p class="bvm-fail">地図に載せられる位置が、まだ確認できていません。</p>';
      return null;
    }

    var cats = [];
    spots.forEach(function (s) { if (cats.indexOf(s.cat) < 0) cats.push(s.cat); });

    el.innerHTML =
      '<div class="bvm">' +
      '<div class="bvm-chips" role="group" aria-label="種類でしぼる">' +
      '<button class="bvm-chip is-on" type="button" data-cat="">ぜんぶ</button>' +
      cats.map(function (c) {
        return '<button class="bvm-chip" type="button" data-cat="' + esc(c) + '" ' +
          'style="--chip:' + colorFor(c) + '">' + esc(c) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="bvm-canvas" id="bvm-canvas"></div>' +
      '<p class="bvm-note"></p>' +
      '</div>';

    var canvas = el.querySelector('.bvm-canvas');
    var map = L.map(canvas, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    // 指1本のスクロールでページが動かなくなるのを防ぐ（スマホでの定番の困りごと）
    map.once('focus', function () { map.scrollWheelZoom.enable(); });

    var byName = {};
    posts.forEach(function (p) { (byName[p.spot] = byName[p.spot] || []).push(p); });

    var markers = [];
    pinned.forEach(function (s) {
      var color = colorFor(s.cat);
      var icon = L.divIcon({
        className: 'bvm-pin-wrap',
        html: '<span class="bvm-pin" style="--pin:' + color + '"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        popupAnchor: [0, -20],
      });
      var m = L.marker([s.lat, s.lng], { icon: icon, title: s.name, alt: s.name, keyboard: true });
      var mine = byName[s.name] || [];
      m.bindPopup(
        '<div class="bvm-pop">' +
        '<b class="bvm-pop-nm">' + esc(s.name) + '</b>' +
        (s.access ? '<span class="bvm-pop-acc">' + esc(s.access) + '</span>' : '') +
        (s.ages ? '<span class="bvm-pop-ages">' + esc(s.ages) + '</span>' : '') +
        (s.geoApprox
          ? '<span class="bvm-pop-approx">※ピンはおよその位置です' +
            (s.geoNote ? '（' + esc(s.geoNote) + '）' : '') + '</span>'
          : '') +
        // ★リンクは声より前に置く。声が長いとふきだしが伸びて、
        //   ボタンが地図の外に押し出されて押せなくなる（300字の投稿で実際に起きた）。
        '<span class="bvm-pop-links">' +
        '<a href="' + esc(s.map || mapURL(s.name)) + '" target="_blank" rel="noopener">📍 地図で見る</a>' +
        (s.official ? '<a href="' + esc(s.official) + '" target="_blank" rel="noopener">🔗 公式</a>' : '') +
        '<a href="#' + esc(slug(s.name)) + '" class="bvm-pop-jump">くわしく ↓</a>' +
        '</span>' +
        (mine.length
          ? '<span class="bvm-pop-voice">「' + esc(mine[0].text) + '」</span>'
          : '') +
        '</div>',
        { maxWidth: 260 }
      );
      m.bvCat = s.cat;
      m.addTo(map);
      markers.push(m);
    });

    fit(markers);
    note();

    // カテゴリのしぼり込み
    el.querySelector('.bvm-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.bvm-chip');
      if (!chip) return;
      el.querySelectorAll('.bvm-chip').forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      var cat = chip.dataset.cat;
      var shown = [];
      markers.forEach(function (m) {
        var on = !cat || m.bvCat === cat;
        if (on) { m.addTo(map); shown.push(m); } else map.removeLayer(m);
      });
      fit(shown);
      note(cat);
      if (typeof opts.onSelect === 'function') opts.onSelect(cat);
    });

    // ポップアップの「くわしく ↓」で下の一覧へ飛ぶ
    canvas.addEventListener('click', function (e) {
      var j = e.target.closest('.bvm-pop-jump');
      if (!j) return;
      var target = document.querySelector(j.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('is-hit'); setTimeout(function () { target.classList.remove('is-hit'); }, 1600); }
    });

    function fit(list) {
      if (!list.length) return;
      map.fitBounds(L.latLngBounds(list.map(function (m) { return m.getLatLng(); })).pad(0.18), {
        maxZoom: list.length === 1 ? 15 : 13,
      });
    }

    // ピンを立てられなかったスポットの件数を正直に出す
    function note(cat) {
      var target = cat ? spots.filter(function (s) { return s.cat === cat; }) : spots;
      var missing = target.filter(function (s) { return typeof s.lat !== 'number'; });
      var approx = target.filter(function (s) { return s.geoApprox; }).length;
      var parts = [];
      parts.push('ピン ' + (target.length - missing.length) + '件');
      if (approx) parts.push('うち ' + approx + '件はおよその位置');
      if (missing.length) {
        parts.push(
          missing.length + '件は地図上の位置が確認できていないため、ピンを立てていません（' +
          missing.map(function (s) { return '「' + s.name.replace(/[（(].*$/, '') + '」'; }).join(' ') + '）'
        );
      }
      el.querySelector('.bvm-note').textContent = parts.join(' ／ ');
    }

    return map;
  }

  // build-map.mjs の slug() と同じ規則（スポット名 → 要素id）
  function slug(name) {
    var bytes = new TextEncoder().encode(name);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return 's-' + hex.slice(0, 12);
  }

  global.BVMap = { mount: mount, slug: slug };
})(window);
