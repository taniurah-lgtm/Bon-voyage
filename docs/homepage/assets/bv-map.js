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
      '<button class="bvm-chip is-on" type="button" aria-pressed="true" data-cat="">ぜんぶ</button>' +
      cats.map(function (c) {
        return '<button class="bvm-chip" type="button" aria-pressed="false" data-cat="' + esc(c) + '" ' +
          'style="--chip:' + colorFor(c) + '">' + esc(c) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="bvm-canvas"></div>' +
      '<p class="bvm-note"></p>' +
      '<p class="bvm-off" hidden></p>' +
      '</div>';

    var canvas = el.querySelector('.bvm-canvas');
    // ズームボタンは右下に置く。左上だと北西のピン（八国山緑地）が真下に入って押せない。
    var map = L.map(canvas, {
      scrollWheelZoom: false, zoomControl: false,
      closePopupOnClick: true,
    });
    // 地図そのものに名前を付ける（無いと読み上げでただの領域になる）
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'おでかけスポットの地図');
    L.control.zoom({
      position: 'bottomright',
      zoomInTitle: '拡大', zoomOutTitle: '縮小',
    }).addTo(map);
    var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    });
    var tileFails = 0;
    tiles.on('tileerror', function () {
      tileFails++;
      // 数枚の失敗はよくあるが、まとまって落ちたら地図が真っ白に見える。黙らない。
      if (tileFails === 6) {
        var n = el.querySelector('.bvm-note');
        if (n && n.textContent.indexOf('地図の下地') < 0) {
          n.textContent = '地図の下地が読み込めていません（ピンと一覧はそのまま使えます）／' + n.textContent;
        }
      }
    });
    tiles.addTo(map);
    // 指1本のスクロールでページが動かなくなるのを防ぐ
    map.once('focus', function () { map.scrollWheelZoom.enable(); });

    // 「くわしく ↓」の飛び先（スポット一覧）が、このページにあるか。
    // opts.hasList で明示できるが、既定はページ内に該当 id があるかで判断する。
    var hasList = typeof opts.hasList === 'boolean'
      ? opts.hasList
      : pinned.some(function (s) { return !!document.getElementById(slug(s.name)); });

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
        // 飛び先の一覧が無いページ（会員ページ）でこれを出すと、押しても何も起きず、
        // 履歴に # だけが積まれる。一覧があるページだけ出す。
        (hasList ? '<a href="#' + esc(slug(sp.name)) + '" class="bvm-pop-jump">くわしく ↓</a>' : '') +
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
        { maxWidth: 268, autoPanPadding: [16, 16], closeButton: true }
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
    // 花小金井を軸に固定していたが、それだと 14本のうち 6本（西武園・所沢・多摩動物公園・
    // サマーランド・立川・吉祥寺）が最初から画面の外に出ていて、開いた人には「無い」に見えた。
    // 「重なるから全域に合わせない」は、まとめ表示（クラスタ）を入れる前の判断。
    // いまは近いピンはまとめて出るので、全件が入るところに合わせるほうが安全。
    function fitAll(list) {
      var pts = (list && list.length ? list : places).map(function (pl) { return [pl.lat, pl.lng]; });
      if (!pts.length) { map.setView(HOME, 12); return; }
      if (pts.length === 1) { map.setView(pts[0], 14); return; }
      // 右下は帰属表示とズームボタン、左下は「近く／全体」が乗っている。
      // そこにピンが入ると、見えているのに押せない（実際に1本そうなっていた）。
      map.fitBounds(L.latLngBounds(pts).pad(0.05), {
        maxZoom: 13, paddingTopLeft: [10, 10], paddingBottomRight: [48, 52],
      });
    }
    fitAll(places);

    // 全件が入る縮尺だと、近所（小金井公園・多摩六都・田無など）が1つにまとまってしまう。
    // 読む人の家は花小金井なので、近所だけ見たい／全体を見たいを2つのボタンで行き来できるようにする。
    // 「近く」は縮尺を決め打ちにしない（決め打ちだと近所のピンまで枠の外に出た）。
    // 花小金井から 6km ほどの範囲にあるピンが、ちょうど入るところに合わせる。
    function nearHome(list) {
      var home = L.latLng(HOME[0], HOME[1]);
      var near = (list || []).filter(function (pl) { return home.distanceTo([pl.lat, pl.lng]) <= 6000; });
      return near.length ? near : list;
    }

    var homeCtl = L.control({ position: 'bottomleft' });
    homeCtl.onAdd = function () {
      var d = L.DomUtil.create('div', 'bvm-view');
      d.innerHTML =
        '<button type="button" class="bvm-view-btn" data-view="home">近く</button>' +
        '<button type="button" class="bvm-view-btn" data-view="all">全体</button>';
      L.DomEvent.disableClickPropagation(d);
      d.addEventListener('click', function (e) {
        var b = e.target.closest('.bvm-view-btn');
        if (!b) return;
        if (b.dataset.view === 'home') fitAll(nearHome(filterCat ? visiblePlaces() : places));
        else fitAll(filterCat ? visiblePlaces() : places);
      });
      return d;
    };
    homeCtl.addTo(map);

    // 画面の外に出ているピンは、その人には「無い」ものになる。黙って隠さず、何件あるか言う。
    // ★ここでピンを組み直してはいけない（ふきだしの autoPan が moveend を呼ぶので消えてしまう）。
    //   触るのはこの1行だけ。
    function tellOffscreen() {
      var b = map.getBounds();
      var list = visiblePlaces();
      var out = list.filter(function (pl) { return !b.contains([pl.lat, pl.lng]); });
      var n = out.reduce(function (a, pl) { return a + pl.spots.length; }, 0);
      var $off = el.querySelector('.bvm-off');
      if (!n) { $off.hidden = true; $off.textContent = ''; return; }
      $off.hidden = false;
      $off.textContent = 'いま画面の外に ' + n + '件あります（地図左下の「全体」で出ます）';
    }
    // Leaflet 1.9.4 は閉じるボタンのラベルを差し替える設定を持っていない。
    // 日本語のページで「Close popup」と読み上げられるので、開いたときに書き換える。
    map.on('popupopen', function (e) {
      var btn = e.popup && e.popup._container && e.popup._container.querySelector('.leaflet-popup-close-button');
      if (btn) { btn.setAttribute('aria-label', 'ふきだしを閉じる'); btn.setAttribute('title', 'ふきだしを閉じる'); }
    });
    map.on('moveend zoomend', tellOffscreen);
    tellOffscreen();
    // ★ moveend では組み直さない。ピン同士の画面上の距離は縮尺だけで決まり、
    //   平行移動では変わらない。moveend で組み直すと、ふきだしを開いたときの
    //   autoPan が再描画を呼び、開いたふきだしがすぐ消える（実際にそうなっていた）。
    map.on('zoomend', render);
    render();

    // ---- 操作 ---------------------------------------------------------------
    el.querySelector('.bvm-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.bvm-chip');
      if (!chip) return;
      el.querySelectorAll('.bvm-chip').forEach(function (c) {
        c.classList.toggle('is-on', c === chip);
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      filterCat = chip.dataset.cat;
      var list = visiblePlaces();
      // しぼった側も「ぜんぶ」も、その時に出るピンが全部入るところに合わせる。
      // 画面の外にピンが残ると、その場所は無いものとして扱われてしまう。
      fitAll(filterCat ? list : places);
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
      // 飛び先が閉じた <details> の中にあると、スクロールしても何も見えない。
      // 先に開けてから飛ぶ（会員ページの一覧は畳んで置いてある）。
      var box = target.closest('details');
      while (box) { box.open = true; box = box.parentElement && box.parentElement.closest('details'); }
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
