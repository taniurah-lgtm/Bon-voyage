/* ぼんぼやーじゅ通信 — おでかけマップ（描画のみ）
 *
 *   BVMap.mount(el, { spots, posts, onSelect })
 *     spots … data/map-spots.json の中身（lat/lng があるものにピンを立てる）
 *     posts … みんなの声（spot 名でスポットに紐づく）。無くてよい
 *
 * Leaflet はリポジトリ内（/assets/leaflet/）から読む。CDNには依存しない。
 * 地図のタイルだけは OpenStreetMap から取る（地図なので外部からになる）。
 * ピンは画像を使わず CSS（divIcon）で描くので、カテゴリごとに色を変えられる。
 *
 * ★重なりの扱い（ここは一度こじれた）
 *   多摩全域を1画面に収めると、田無〜西東京あたりでピンが物理的に重なり、
 *   押したピンとは別の場所が開いていた（18本のうち8本で発生）。
 *   ピンを少しずらす方法は取らない。この縮尺では30pxが約1kmで、地図が嘘をつく。
 *   代わりに、重なっているピンは「まとめて件数で」出す。タップすると寄って開く。
 *   まとめた印（●3）はどこか1つの場所を主張しないので、位置の嘘にならない。
 */
(function (global) {
  'use strict';

  // カテゴリ（先頭の絵文字）ごとのピンの色。知らないカテゴリは既定色。
  // ★キーは data/map-spots.json の cat の先頭絵文字と一致させる。
  //   ずれると既定色になり、チップとピンが同じ色になって見分けられない
  //   （'🐘' '🎠' と書いていて、実データは '🦒動物とふれあう' '🏊夏のプール' だった）。
  var COLORS = {
    '🌳': '#5C9E5A', // 大きな公園で1日
    '💧': '#3E9BC4', // 無料で水あそび
    '☔': '#8A7BC8', // 雨・猛暑の日の屋内
    '🚃': '#D08A3C', // 電車でおでかけ
    '🦒': '#C4703E', // 動物とふれあう
    '🏊': '#C75B8A', // 夏のプール
  };
  var DEFAULT_COLOR = '#2C7C9E';
  var OVERLAP_PX = 34;     // これより近いピンは「まとめて」出す
  var HOME = [35.7255, 139.5085];  // 花小金井駅あたり

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mapURL(q) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function colorFor(cat) {
    for (var k in COLORS) if (cat && cat.indexOf(k) === 0) return COLORS[k];
    return DEFAULT_COLOR;
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
      '<div class="bvm-canvas"></div>' +
      '<p class="bvm-note"></p>' +
      '</div>';

    var canvas = el.querySelector('.bvm-canvas');
    var map = L.map(canvas, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    // 指1本のスクロールでページが動かなくなるのを防ぐ
    map.once('focus', function () { map.scrollWheelZoom.enable(); });

    var byName = {};
    posts.forEach(function (p) { (byName[p.spot] = byName[p.spot] || []).push(p); });

    // 同じ座標のスポットは1つの「場所」として扱う
    //（西武園ゆうえんち と 西武園ゆうえんちプール は同じ施設で、2本重ねると両方押せない）
    var places = [];
    var byPos = {};
    pinned.forEach(function (s) {
      var k = s.lat.toFixed(5) + ',' + s.lng.toFixed(5);
      if (byPos[k]) { byPos[k].spots.push(s); return; }
      byPos[k] = { lat: s.lat, lng: s.lng, spots: [s] };
      places.push(byPos[k]);
    });

    var layer = L.layerGroup().addTo(map);
    var filterCat = '';

    // ---- ふきだしの中身 -----------------------------------------------------
    function spotBlock(sp) {
      var mine = byName[sp.name] || [];
      return '<div class="bvm-pop-one">' +
        '<b class="bvm-pop-nm">' + esc(sp.name) + '</b>' +
        (sp.access ? '<span class="bvm-pop-acc">' + esc(sp.access) + '</span>' : '') +
        (sp.ages ? '<span class="bvm-pop-ages">' + esc(sp.ages) + '</span>' : '') +
        (sp.geoApprox
          ? '<span class="bvm-pop-approx">※ピンはおよその位置です' +
            (sp.geoNote ? '（' + esc(sp.geoNote) + '）' : '') + '</span>'
          : '') +
        // リンクは声より前に置く。声が長いとふきだしが伸びて、
        // ボタンが地図の外に押し出されて押せなくなる（300字の投稿で実際に起きた）。
        '<span class="bvm-pop-links">' +
        '<a href="' + esc(sp.map || mapURL(sp.name)) + '" target="_blank" rel="noopener">📍 地図で見る</a>' +
        (sp.official ? '<a href="' + esc(sp.official) + '" target="_blank" rel="noopener">🔗 公式</a>' : '') +
        '<a href="#' + esc(slug(sp.name)) + '" class="bvm-pop-jump">くわしく ↓</a>' +
        '</span>' +
        (mine.length ? '<span class="bvm-pop-voice">「' + esc(mine[0].text) + '」</span>' : '') +
        '</div>';
    }

    // ---- 描画（縮尺が変わるたびに組み直す）----------------------------------
    function visiblePlaces() {
      return places
        .map(function (pl) {
          var sp = filterCat ? pl.spots.filter(function (x) { return x.cat === filterCat; }) : pl.spots;
          return sp.length ? { lat: pl.lat, lng: pl.lng, spots: sp } : null;
        })
        .filter(Boolean);
    }

    function render() {
      layer.clearLayers();
      var list = visiblePlaces();
      if (!list.length) { note(); return; }

      // 画面上の距離で束ねる。まとめる基準は縮尺で変わるので毎回計算する。
      var pts = list.map(function (pl) {
        return { pl: pl, pt: map.latLngToContainerPoint([pl.lat, pl.lng]) };
      });
      var used = [];
      pts.forEach(function (a, i) {
        if (used[i]) return;
        var group = [a];
        used[i] = true;
        pts.forEach(function (b, j) {
          if (used[j] || i === j) return;
          if (Math.abs(a.pt.x - b.pt.x) < OVERLAP_PX && Math.abs(a.pt.y - b.pt.y) < OVERLAP_PX) {
            group.push(b);
            used[j] = true;
          }
        });
        if (group.length === 1) addPin(group[0].pl);
        else addCluster(group.map(function (x) { return x.pl; }));
      });
      note();
    }

    function addPin(pl) {
      var s = pl.spots[0];
      var m = L.marker([pl.lat, pl.lng], {
        icon: L.divIcon({
          className: 'bvm-pin-wrap',
          html: '<span class="bvm-pin" style="--pin:' + colorFor(s.cat) + '"></span>',
          iconSize: [30, 38],
          iconAnchor: [15, 34],
          popupAnchor: [0, -32],
        }),
        title: pl.spots.map(function (x) { return x.name; }).join(' / '),
        alt: s.name,
        keyboard: true,
        riseOnHover: true,
        riseOffset: 400,
      });
      m.bindPopup(
        '<div class="bvm-pop">' + pl.spots.map(spotBlock).join('<hr class="bvm-pop-sep">') + '</div>',
        { maxWidth: 268, autoPanPadding: [24, 24] }
      );
      layer.addLayer(m);
    }

    // まとめた印。件数だけを出す＝どこか1つの場所を主張しないので、位置の嘘にならない。
    function addCluster(list) {
      var all = list.reduce(function (a, pl) { return a.concat(pl.spots); }, []);
      var lat = list.reduce(function (a, pl) { return a + pl.lat; }, 0) / list.length;
      var lng = list.reduce(function (a, pl) { return a + pl.lng; }, 0) / list.length;
      var names = all.map(function (x) { return x.name; });
      var m = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'bvm-cluster-wrap',
          html: '<span class="bvm-cluster">' + all.length + '</span>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22],
        }),
        title: 'この付近に ' + all.length + '件（' + names.join('・') + '）',
        alt: 'この付近に ' + all.length + '件',
        keyboard: true,
      });
      var bounds = L.latLngBounds(list.map(function (pl) { return [pl.lat, pl.lng]; }));
      m.on('click', function () {
        var spread = !bounds.getNorthEast().equals(bounds.getSouthWest());
        if (spread && map.getZoom() < 16) {
          map.fitBounds(bounds.pad(0.4), { maxZoom: Math.min(map.getZoom() + 3, 16) });
        } else {
          // これ以上寄っても離れないので、ふきだしで一覧を出す
          m.bindPopup(
            '<div class="bvm-pop"><b class="bvm-pop-nm">この付近の ' + all.length + '件</b>' +
            all.map(spotBlock).join('<hr class="bvm-pop-sep">') + '</div>',
            { maxWidth: 268 }
          ).openPopup();
        }
      });
      layer.addLayer(m);
    }

    // ピンを立てられなかったスポットの件数を正直に出す
    function note() {
      var target = filterCat ? spots.filter(function (s) { return s.cat === filterCat; }) : spots;
      var missing = target.filter(function (s) { return typeof s.lat !== 'number'; });
      var approx = target.filter(function (s) { return s.geoApprox; }).length;
      var parts = ['ピン ' + (target.length - missing.length) + '件'];
      if (approx) parts.push('うち ' + approx + '件はおよその位置');
      if (missing.length) {
        parts.push(
          missing.length + '件は地図上の位置が確認できていないため、ピンを立てていません（' +
          missing.map(function (s) { return '「' + s.name.replace(/[（(].*$/, '') + '」'; }).join(' ') + '）'
        );
      }
      parts.push('近くのピンは、まとめて件数で出しています（タップで寄ります）');
      el.querySelector('.bvm-note').textContent = parts.join(' ／ ');
    }

    // ---- 初期表示 -----------------------------------------------------------
    // 全域に合わせると多摩全体が入って重なりが増える。花小金井まわりを軸に置き、
    // 遠方は寄る／引くと出てくる（下の一覧にも全件ある）。
    map.setView(HOME, 12);
    // ★ moveend では組み直さない。ピン同士の画面上の距離は縮尺だけで決まり、
    //   平行移動では変わらない。moveend で組み直すと、ふきだしを開いたときの
    //   autoPan が再描画を呼び、開いたふきだしがすぐ消える（実際にそうなっていた）。
    map.on('zoomend', render);
    render();

    // ---- 操作 ---------------------------------------------------------------
    el.querySelector('.bvm-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.bvm-chip');
      if (!chip) return;
      el.querySelectorAll('.bvm-chip').forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      filterCat = chip.dataset.cat;
      var list = visiblePlaces();
      if (!filterCat) {
        // 「ぜんぶ」は全域に合わせない。多摩全体が入ると重なりが増えて読みにくい。
        map.setView(HOME, 12);
      } else if (list.length) {
        map.fitBounds(L.latLngBounds(list.map(function (pl) { return [pl.lat, pl.lng]; })).pad(0.25),
          { maxZoom: list.length === 1 ? 15 : 13 });
      } else {
        map.setView(HOME, 12);
      }
      render();
      if (typeof opts.onSelect === 'function') opts.onSelect(filterCat);
    });

    // ふきだしの「くわしく ↓」で下の一覧へ飛ぶ
    canvas.addEventListener('click', function (e) {
      var j = e.target.closest('.bvm-pop-jump');
      if (!j) return;
      var target = document.querySelector(j.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('is-hit');
      setTimeout(function () { target.classList.remove('is-hit'); }, 1600);
    });

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
