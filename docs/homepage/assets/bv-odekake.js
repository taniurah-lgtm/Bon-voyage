/* ぼんぼやーじゅ通信 — おでかけマップ（2026-11-28 作り直し）
 *
 *   BVOdekake.mount({ items, groups, gmapsKey, home })
 *
 * 2026-11-28 オーナー「見づらい。寒い季節なのにじゃぶじゃぶ池。カフェが全部出ていない」→ 作り直し:
 *   - 地図を先に。種類は短い言葉のボタン（＋年齢・雨でもOK）
 *   - ピンは種類の絵の丸。画面の上で重なるものは数の丸にまとめ、押すと寄る。丸どうしも重ならないまで束ね直す
 *   - ピンを押すと、カードが出る（スマホは画面の下から。地図は上に見えたまま、Googleのロゴも隠さない）
 *   - スマホでは、地図は2本指で動かす（指1本ではページが読み進められる）
 *   - きょう休みの所は薄く。場所のカードには、その近くのこれからの催しと、定例の次の日程も出す
 *   - 地図の下に、しぼった中身を「近い順」（基準は花小金井駅か、いまいる場所）
 * Leaflet はリポジトリ内（/assets/leaflet/）。下地は鍵があれば Googleマップ、無い・読めなければ OpenStreetMap。
 * 会員ページの地図は、これまでの bv-map.js のまま。
 */
(function (global) {
  'use strict';
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var AGE = { baby: ['👶', '0〜2歳'], pre: ['🧒', '年少〜年長'], elem: ['🎒', '小学生'] };
  var MARK = { '◎': 'ぴったり', '○': 'だいじょうぶ', '△': 'ひと工夫', '✕': '対象外', '×': '対象外' };
  // 祝日（「祝日は休み」の判定にだけ使う）。年が変わる前に足す
  var HOL = ['2026-11-03', '2026-11-23', '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05'];
  var PAGE = 12, NEW_DAYS = 7, NEAR_KM = 0.25;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function km(a, b) {
    var dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  function fmtKm(d) { return d < 1 ? Math.round(d * 10) * 100 + 'm' : (Math.round(d * 10) / 10) + 'km'; }
  function md(iso) { if (!iso) return ''; var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return (+p[1]) + '/' + (+p[2]) + '(' + WD[d.getUTCDay()] + ')'; }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

  function mount(opts) {
    var G = {}, now = new Date(Date.now() + 9 * 3600e3);
    if (global.OM_TODAY) now = new Date(global.OM_TODAY + 'T12:00:00Z');   // 見本づくり・試験のときだけ
    var today = now.toISOString().slice(0, 10), dow = now.getUTCDay(), nth = Math.ceil(now.getUTCDate() / 7), hol = HOL.indexOf(today) >= 0;
    var hm = global.OM_TIME || now.toISOString().slice(11, 16), mmdd = today.slice(5);
    var yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10), holY = HOL.indexOf(yesterday) >= 0;
    var tomorrow = new Date(now.getTime() + 864e5).toISOString().slice(0, 10);
    var weekEnd = new Date(now.getTime() + ((7 - dow) % 7) * 864e5).toISOString().slice(0, 10);   // この週末（日曜）まで。日曜はきょうまで
    (opts.groups || []).forEach(function (g) { G[g.key] = g; });
    // 終わった催しは、ページを組み直す前でも出さない
    var items = (opts.items || []).filter(function (it) { return it.k !== 'event' || (it.last || '9999') >= today; });
    items.forEach(function (it) {
      if (it.k === 'event') {
        // 期間のある催し（ライトアップなど）は、始まっていれば「開催中」
        if (it.span && it.span.from <= today) { it.next = ''; it.until = it.span.to; }
        else { it.next = (it.dates || []).filter(function (d) { return d >= today; })[0] || (it.span && it.span.from) || ''; if (!it.next) it.gone = true; }   // 載せた日付が過ぎたもの（組み直す前）は出さない
        it.soon = !!it.next && it.next <= tomorrow;   // きょう・あした（期間中の催しは「開催中」と出す）
      } else if (it.next) it.next = it.next.filter(function (x) { return x.d >= today; });
      it.today = todayState(it);
      it.isNew = !!it.added && dayDiff(it.added, today) <= NEW_DAYS && dayDiff(it.added, today) >= 0;
      it.order = it.k !== 'event' ? '' : it.next ? it.next : weekEnd + 'z';   // 開催中は「この週末まで」のあと、「もっと先」の前
    });
    items = items.filter(function (it) { return !it.gone; });
    var byId = {}; items.forEach(function (it) { byId[it.id] = it; (it.alias || []).forEach(function (a) { byId[a] = it; }); });
    var HOME = opts.home || [35.7261822, 139.5132235];
    var st = { g: '', age: '', rain: false, now: false, base: HOME, baseName: '花小金井駅', sel: '', shown: PAGE };
    var mapEl = $('om-map'), card = $('om-card'), list = $('om-list');
    var phone = !!(global.L && L.Browser.mobile && L.Browser.touch);

    // きょう開いているか（曜日・時間の決まりがある所だけ。分からない所は何も出さない）
    //   open: { dows:[開く曜日], nth:[[曜日,第n]]（そのほかに開く日）, time, byDow:{曜日:時間}, holTime（祝日の時間）,
    //           closedNth:[[曜日,第n]]（休み）, nthHolOpen（祝日なら開く）, hol（祝日は休み）, closedRange:[[MM-DD,MM-DD]],
    //           monHolShift（月曜休み・祝日なら翌日休み）, afterHol（祝日の翌日は休み） }
    function pad(t) { return t.length === 4 ? '0' + t : t; }
    function inRange(r) { return r[0] <= r[1] ? mmdd >= r[0] && mmdd <= r[1] : mmdd >= r[0] || mmdd <= r[1]; }
    function todayState(it) {
      var W = 'きょう（' + WD[dow] + '）';
      if (it.open && !(it.open.validUntil && today > it.open.validUntil) && !(it.open.validFrom && today < it.open.validFrom)) {   // validUntil を過ぎた決まりは使わない（季節で変わる所）
        var o = it.open, on = o.dows.indexOf(dow) >= 0 || (o.nth || []).some(function (x) { return x[0] === dow && x[1] === nth; });
        if ((o.closedNth || []).some(function (x) { return x[0] === dow && x[1] === nth; }) && !(hol && o.nthHolOpen)) on = false;
        if (hol && o.hol) on = false;
        if (hol && o.holOpen) on = true;
        var sh = o.monHolShift ? 1 : o.holShift;   // 休みの曜日が祝日なら開き、その翌日が休み
        if (typeof sh === 'number') { if (dow === sh) on = hol; else if (dow === (sh + 1) % 7 && holY) on = false; }
        if (o.afterHol && holY) on = false;
        if ((o.closedRange || []).some(inRange)) on = false;
        if ((o.closedDates || []).indexOf(today) >= 0) on = false;
        if (o.calendar) return on ? { on: true, kind: 'open', text: W + 'は営業日（時間は公式のカレンダーで）' } : { on: false, kind: 'closed', text: W + 'は休み（公式のカレンダーより）' };
        var days = o.dows.length === 7 ? '毎日' : (o.dows.length === 6 && o.dows.indexOf(0) < 0 ? '月〜土曜' : o.dows.map(function (d) { return WD[d]; }).join('・') + '曜') +
          ((o.nth || []).length ? 'と第' + o.nth[0][1] + WD[o.nth[0][0]] + '曜' : '');
        if (!on) return { on: false, kind: 'closed', text: W + 'は休み' + (o.dows.length < 5 ? '・開くのは' + days : '') };
        var t = (hol && o.holTime) || (o.byDow && o.byDow[dow]) || o.time || '';
        var m = t.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
        if (m && hm >= pad(m[2])) return { on: false, kind: 'done', text: W + 'は終わりました（' + t + '）' };
        if (m && hm < pad(m[1])) return { on: true, kind: 'before', text: W + m[1] + 'から（' + t + '）', from: m[1] };
        return { on: true, kind: 'open', text: W + t };
      }
      if (it.closed) {
        var off = it.closed.dows.indexOf(dow) >= 0 || (hol && it.closed.hol);
        return off ? { on: false, kind: 'closed', text: W + 'は定休日' } : null;
      }
      return null;
    }
    // 「すべて」では、催しは「この週末まで」のものと、短い期間（ひと月以内）の開催中のものだけピンにする。
    // 長く続く催し（プラネタリウム・イルミネーションなど）は「催し」を押したときに出す（最初の画面を場所の絵で見せる）
    function evBrief(it) {
      if (it.k !== 'event') return true;
      if (it.next) return it.next <= weekEnd;
      return it.span && dayDiff(it.span.from, it.span.to) <= 31;
    }
    function ok(it, skip) {
      if (skip !== 'g' && st.g && it.g !== st.g) return false;
      if (!st.g && skip !== 'g' && !evBrief(it)) return false;
      if (st.now && (it.today && !it.today.on || it.k === 'event' && it.next && it.next !== today)) return false;
      if (st.age && it.ages && !/[◎○]/.test(it.ages[st.age] || '')) return false;
      if (st.rain && !it.indoor) return false;
      return true;
    }
    function dist(it) { return typeof it.lat === 'number' ? km(st.base, [it.lat, it.lng]) : 999; }
    function nearEvents(it) {
      if (it.k === 'event') return [];
      return items.filter(function (e) { return e.k === 'event' && km([it.lat, it.lng], [e.lat, e.lng]) <= NEAR_KM; })
        .sort(function (a, b) { return (a.next || '0').localeCompare(b.next || '0'); });
    }

    // ---- 地図 ---------------------------------------------------------------
    var map = null, layer = null, homeMark = null;
    if (global.L && mapEl) {
      map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.25, tap: false, dragging: !phone, bounceAtZoomLimits: false });
      L.control.zoom({ position: 'bottomright', zoomInTitle: '拡大', zoomOutTitle: '縮小' }).addTo(map);
      baseLayer(map, opts.gmapsKey || '');
      layer = L.layerGroup().addTo(map);
      map.on('zoomend', drawPins);
      map.on('click', function () { select(''); });
      // 駅の印はピンより手前に（押せない印なので、下のピンはそのまま押せる）
      // 駅の印はピンの下に。ピンや丸が駅の名前の札にかかるときは、札を消して点だけにする（件数を隠さない）
      homeMark = L.marker(HOME, { icon: L.divIcon({ className: 'om-home', html: '<i></i><span>花小金井駅</span>', iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map);
      if (phone) twoFingerHint();
    } else if (mapEl) {
      mapEl.innerHTML = '<p class="om-fail">地図を読み込めませんでした。下の一覧からお探しください。</p>';
    }
    // スマホ: 指1本ではページが動き、地図は2本指で動かす。指1本でなぞったら、そう知らせる
    function twoFingerHint() {
      var tip = document.createElement('div'); tip.className = 'om-tip'; tip.textContent = '地図は2本の指で動かせます'; tip.hidden = true;
      mapEl.appendChild(tip);
      var t0 = null, timer = 0;
      mapEl.addEventListener('touchstart', function (e) { t0 = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null; if (e.touches.length > 1) tip.hidden = true; }, { passive: true });
      mapEl.addEventListener('touchmove', function (e) {
        if (!t0 || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - t0[0], dy = e.touches[0].clientY - t0[1];
        if (Math.abs(dx) + Math.abs(dy) > 24) { tip.hidden = false; clearTimeout(timer); timer = setTimeout(function () { tip.hidden = true; }, 1400); t0 = null; }
      }, { passive: true });
    }
    function baseLayer(m, gkey) {
      var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
      function useOSM() { if (!m.hasLayer(osm)) osm.addTo(m); }
      if (global.OM_PLAIN) return;   // 見本（外の画像を読めない所）では下地なし
      if (!(gkey && L.gridLayer && L.gridLayer.googleMutant)) { useOSM(); return; }
      var done = false, failed = false;
      // 下地のアイコン（お店・名所・寺社・学校・病院・役所）は消す。このページのピンと見間違えないように
      var off = function (t) { return { featureType: t, elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }; };
      var g = L.gridLayer.googleMutant({ type: 'roadmap', maxZoom: 18, styles: [{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] }, off('poi.attraction'), off('poi.place_of_worship'), off('poi.school'), off('poi.medical'), off('poi.government'), off('poi.sports_complex'), off('transit.station.bus')] });
      function back() { if (failed) return; failed = true; if (m.hasLayer(g)) m.removeLayer(g); useOSM(); }
      var prev = global.gm_authFailure;
      global.gm_authFailure = function () { back(); if (typeof prev === 'function') prev(); };
      if (!(global.google && global.google.maps && global.google.maps.Map)) {
        global.__omReady = function () { done = true; };
        var sc = document.createElement('script');
        sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(gkey) + '&language=ja&region=JP&loading=async&callback=__omReady';
        sc.async = true; sc.onerror = back; document.head.appendChild(sc);
      } else done = true;
      g.addTo(m);
      setTimeout(function () { if (!done && !(global.google && global.google.maps && global.google.maps.Map)) back(); }, 8000);
    }

    function shortName(n) { return n.replace(/[（(「].*$/, '').replace(/^(都立|国営|小平市立|小平市|子ども家庭支援センター)\s*/, '').slice(0, 10); }
    function pinIcon(it, on, named) {
      var g = G[it.g] || {}, cls = (on ? ' on' : '') + (it.today && !it.today.on ? ' off' : '');
      var nm = named ? '<em class="om-nm">' + esc(shortName(it.name)) + '</em>' : '';
      if (it.k === 'event') {
        var lab = it.next ? md(it.next).replace(/\(.\)/, '') : '開催中';
        return L.divIcon({ className: 'om-pin-w', html: '<span class="om-ev' + cls + (it.pr ? ' pr' : '') + (it.soon ? ' soon' : '') + '" style="--c:' + g.color + '"><b>' + esc(lab) + '</b></span>' + nm, iconSize: [54, 32], iconAnchor: [27, 16] });
      }
      return L.divIcon({ className: 'om-pin-w', html: '<span class="om-pin' + cls + '" style="--c:' + g.color + '">' + g.icon + '</span>' + nm, iconSize: [34, 34], iconAnchor: [17, 17] });
    }
    // 画面の上で近いピンをまとめる。まとめた丸どうしがまだ重なるなら、重ならなくなるまで束ね直す
    function drawPins() {
      if (!map) return;
      layer.clearLayers();
      // 1つのピンの幅と高さ（催しは日付の札で横に長い）。まとめた丸は 38px
      function box(gr) { return gr.list.length > 1 ? [58, 32] : gr.list[0].k === 'event' ? [54, 30] : [30, 30]; }
      var groups = items.filter(function (it) { return typeof it.lat === 'number' && ok(it); }).map(function (it) {
        var p = map.latLngToContainerPoint([it.lat, it.lng]); return { list: [it], x: p.x, y: p.y, fixed: it.id === st.sel };
      });
      function overlap(a, b) { var ba = box(a), bb = box(b); return Math.abs(a.x - b.x) < (ba[0] + bb[0]) / 2 && Math.abs(a.y - b.y) < (ba[1] + bb[1]) / 2; }
      function mergeAll() {
        var changed = true, guard = 0;
        while (changed && guard++ < 400) {
          changed = false;
          outer: for (var i = 0; i < groups.length; i++) for (var j = i + 1; j < groups.length; j++) {
            var a = groups[i], b = groups[j];
            if (a.fixed || b.fixed) continue;   // 選んだピンはまとめない（選んだほうが上に出る）
            if (overlap(a, b)) {
              var n = a.list.length + b.list.length;
              a.x = (a.x * a.list.length + b.x * b.list.length) / n; a.y = (a.y * a.list.length + b.y * b.list.length) / n;
              a.list = a.list.concat(b.list); groups.splice(j, 1); changed = true; break outer;
            }
          }
        }
      }
      mergeAll();
      var named = map.getZoom() >= 15;
      if (homeMark) {
        var hp = map.latLngToContainerPoint(homeMark.getLatLng()), lab = [hp.x - 10, hp.y - 14, hp.x + 82, hp.y + 10];
        // 駅の点の上に、まとめた丸が乗ったら、丸を点の上側へずらす（基準の駅が見えるように）。
        // ずらした先でほかと重なるなら、もう一度まとめ直す（それでも駅に乗るなら、そのまま。名前の札だけ消す）
        for (var round = 0; round < 3; round++) {
          var moved = false;
          groups.forEach(function (gr) {
            if (gr.list.length < 2 || gr.fixed) return;
            var bx = box(gr);
            if (Math.abs(gr.x - hp.x) < bx[0] / 2 + 8 && Math.abs(gr.y - hp.y) < bx[1] / 2 + 8) { gr.y = hp.y - bx[1] / 2 - 16; moved = true; }
          });
          if (!moved) break;
          var before = groups.length; mergeAll();
          if (groups.length === before) break;
        }
        var hit = groups.some(function (gr) { var bx = box(gr); return gr.x + bx[0] / 2 > lab[0] && gr.x - bx[0] / 2 < lab[2] && gr.y + bx[1] / 2 > lab[1] && gr.y - bx[1] / 2 < lab[3]; });
        var he = homeMark.getElement(); if (he) he.classList.toggle('nolabel', hit);
      }
      groups.forEach(function (gr) { if (gr.list.length === 1) addPin(gr.list[0], named); else addGroup(gr.list, map.containerPointToLatLng([gr.x, gr.y])); });
    }
    function addPin(it, named) {
      var on = st.sel === it.id;
      var m = L.marker([it.lat, it.lng], { icon: pinIcon(it, on, named), keyboard: true, riseOnHover: true, zIndexOffset: on ? 2000 : (it.k === 'event' ? 600 : 0) });
      m.on('click', function (e) { L.DomEvent.stopPropagation(e); select(it.id, true); });
      m.on('add', function () { var el = m.getElement(); if (el) { el.setAttribute('role', 'button'); el.setAttribute('aria-label', label(it)); el.title = it.name; } });
      layer.addLayer(m);
    }
    function addGroup(arr, at) {
      var names = arr.map(function (it) { return it.name; });
      // 中身の種類の絵を、多い順に2つまで（「☕🏠 7」）
      var cnt = {}; arr.forEach(function (it) { cnt[it.g] = (cnt[it.g] || 0) + 1; });
      var ic = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 2).map(function (k) { return (G[k] || {}).icon || ''; }).join('');
      var m = L.marker(at, { icon: L.divIcon({ className: 'om-pin-w', html: '<span class="om-cl"><i aria-hidden="true">' + ic + '</i>' + arr.length + '</span>', iconSize: [58, 32], iconAnchor: [29, 16] }), keyboard: true, zIndexOffset: 300 });
      m.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        var b = L.latLngBounds(arr.map(function (it) { return [it.lat, it.lng]; }));
        var same = b.getNorthEast().distanceTo(b.getSouthWest()) < 25;   // 同じ建物（児童館とこども広場など）
        if (!same && map.getZoom() < 17) map.flyToBounds(b.pad(0.6), { maxZoom: Math.min(Math.max(map.getZoom() + 2, 14), 17), duration: 0.45 });
        else showGroup(arr);
      });
      m.on('add', function () { var el = m.getElement(); if (el) { el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'この付近に' + arr.length + '件（押すと寄ります）：' + names.join('、')); el.title = names.join('・'); } });
      layer.addLayer(m);
    }
    function label(it) { return (G[it.g] ? G[it.g].label + '：' : '') + it.name + (it.k === 'event' && it.next ? '（' + md(it.next) + '）' : '') + (it.today && !it.today.on ? '（' + it.today.text + '）' : ''); }

    // ---- 見る範囲 -------------------------------------------------------------
    function fit(view) {
      if (!map) return;
      var vis = items.filter(function (it) { return typeof it.lat === 'number' && ok(it); });
      var pts = vis;
      if (view === 'near') {
        var near = vis.filter(function (it) { return km(st.base, [it.lat, it.lng]) <= (st.g ? 3.2 : 1.8); });
        pts = near.length >= 4 ? near : vis.slice().sort(function (a, b) { return dist(a) - dist(b); }).slice(0, 8);
      }
      var ll = pts.map(function (it) { return [it.lat, it.lng]; });
      ll.push(st.base);
      if (ll.length < 2) { map.setView(st.base, 14); return; }
      map._omFitting = true;
      map.fitBounds(L.latLngBounds(ll), { paddingTopLeft: [16, 52], paddingBottomRight: [48, 30], maxZoom: 15 });
      map._omFitting = false;
      outside();
    }
    // 画面の外にあるものの数（立川・吉祥寺・所沢など）
    function outside() {
      var el = $('om-out'); if (!el || !map) return;
      var b = map.getBounds(), n = items.filter(function (it) { return typeof it.lat === 'number' && ok(it) && !b.contains([it.lat, it.lng]); }).length;
      el.hidden = !n; el.textContent = '画面の外に あと' + n + '件';
    }

    // ---- カード ---------------------------------------------------------------
    function ages(it) {
      if (!it.ages) return '';
      return '<div class="om-ages" aria-label="年齢の目安">' + ['baby', 'pre', 'elem'].map(function (k) {
        var v = it.ages[k] || ''; if (!v) return '';
        return '<span class="om-age-c m' + ('◎○△'.indexOf(v) + 1) + '" title="' + AGE[k][1] + '：' + (MARK[v] || v) + '">' + AGE[k][0] + ' <b>' + esc(v) + '</b><small>' + AGE[k][1] + '</small></span>';
      }).join('') + '</div><p class="om-agekey">◎ぴったり ○だいじょうぶ △ひと工夫 ✕対象外</p>';
    }
    // 花小金井駅（現在地を使っているときは、いまいる場所）からの経路。所要時間と乗り換えは Googleマップが出す
    function route(it) {
      var to = it.k === 'event' && typeof it.lat === 'number' ? it.lat.toFixed(6) + ',' + it.lng.toFixed(6) : it.q;   // 催しは会場の位置へ（催しの名前では見つからないことがある）
      if (!to) return '';
      return 'https://www.google.com/maps/dir/?api=1' + (st.baseName === '花小金井駅' ? '&origin=' + encodeURIComponent('花小金井駅') : '') + '&destination=' + encodeURIComponent(to) + '&travelmode=transit';
    }
    function btn(href, text, cls, ext) { return href ? '<a class="om-b' + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + text + '</a>' : ''; }
    function cardHTML(it) {
      var g = G[it.g] || {}, d = dist(it);
      var head = '<div class="om-ch"><span class="om-ci" style="--c:' + g.color + '" aria-hidden="true">' + g.icon + '</span><div class="om-cn"><b>' + esc(it.name) + '</b>' +
        (it.pr ? '<span class="om-pr">PR</span>' : '') + (it.isNew ? '<span class="om-new">新しく載せました</span>' : '') +
        '<span class="om-cm">' + esc(g.label) + (d < 999 ? '・' + esc(st.baseName) + 'から直線' + fmtKm(d) : '') + '</span></div>' +
        '<button type="button" class="om-x" aria-label="閉じる">×</button></div>';
      var body = '';
      if (it.today) body += '<p class="om-today ' + (it.today.on ? 'on' : 'off') + '">' + esc(it.today.text) + '</p>';
      if (it.k === 'event') {
        body += '<p class="om-when"><b>' + esc(it.next ? (it.next === today ? 'きょう ' : it.next === tomorrow ? 'あした ' : '') + md(it.next) : '開催中（〜' + md(it.until) + '）') + '</b>' + (it.when ? '<br>' + esc(it.when) : '') + '</p>';
        if (it.place) body += '<p class="om-acc">📍 ' + esc(it.place) + '</p>';
        body += '<div class="om-bs">' + btn(it.off, '公式の案内', 'main', true) + btn(route(it), st.baseName + 'からの行き方', '', true) + btn(it.week, '今週の号で読む') + btn(it.map, 'Googleマップ', '', true) + btn('/calendar.html', 'カレンダー') + '</div>';
        if (it.pr) body += '<p class="om-prn">PR：' + esc(it.pr) + 'のご協賛で掲載しています</p>';
        body += ages(it);
        if (it.desc) body += '<p class="om-desc clamp">' + esc(it.desc) + '</p><button type="button" class="om-more-t">続きを読む</button>';
        if (it.note) body += '<p class="om-note">' + esc(it.note) + '</p>';
        if (it.cost) body += '<p class="om-cost">費用: ' + esc(it.cost) + '</p>';
      } else {
        if (it.season) body += '<p class="om-season-tag">' + esc(it.season) + '</p>';
        if (it.acc) body += '<p class="om-acc">📍 ' + esc(it.acc) + '</p>';
        // 押すボタンは上に（行き方・公式）。読みものはその下
        body += '<div class="om-bs">' + btn(route(it), '🚃 ' + st.baseName + 'からの行き方', 'main', true) + btn(it.map, 'Googleマップで開く', '', true) + btn(it.more, 'カフェのくわしい情報') + btn(it.week, '今週の号で読む') + btn(it.otayori && it.otayori.url, '今月のおたより', '', true) + btn(it.teirei, '定例の日程') + btn(it.off, '公式', '', true) + '</div>';
        body += ages(it);
        if (it.tags && it.tags.length) body += '<ul class="om-tags" aria-label="お店の設備">' + it.tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        if (it.next && it.next.length) body += '<div class="om-sub"><b>🗓 次の定例</b><ul>' + it.next.slice(0, 3).map(function (x) { return '<li>' + md(x.d) + ' ' + esc(x.t) + (x.time ? ' <small>' + esc(x.time) + '</small>' : '') + '</li>'; }).join('') + '</ul></div>';
        var ev = nearEvents(it);
        if (ev.length) body += '<div class="om-sub"><b>📅 ここで開かれる催し</b><ul>' + ev.slice(0, 4).map(function (e) { return '<li><button type="button" data-id="' + esc(e.id) + '">' + esc(e.next ? md(e.next) : '開催中') + ' ' + esc(e.name) + '</button></li>'; }).join('') + '</ul></div>';
        if (it.desc) body += '<p class="om-desc clamp">' + esc(it.desc) + '</p><button type="button" class="om-more-t">続きを読む</button>';
        if (it.reader) body += '<div class="om-reader"><b>💬 読者の方から</b>' + esc(it.reader) + '</div>';
        if (it.visited && it.visited.length) body += '<div class="om-reader"><b>👣 家族で行って確かめたこと</b>' + esc(it.visited.join('／')) + '</div>';
        if (it.hours) body += '<p class="om-cost">営業: ' + esc(it.hours) + '</p>';
        if (it.approx) body += '<p class="om-approx">※ピンはおよその位置です</p>';
        if (it.voices && it.voices.length) body += '<div class="om-voices">' + it.voices.map(function (v) { return '<p>「' + esc(v.text) + '」<small>— ' + esc(v.who || 'ご近所の方') + (v.date ? '・' + esc(v.date) : '') + '</small></p>'; }).join('') + '</div>';
      }
      var share = 'https://line.me/R/share?text=' + encodeURIComponent(it.name + '\n' + location.origin + location.pathname + '#' + it.id);
      body += '<p class="om-share"><a class="om-b line" href="' + esc(share) + '" target="_blank" rel="noopener">LINEで家族に送る</a></p>';
      return head + '<div class="om-cb">' + body + '</div>';
    }
    function showGroup(arr) {
      st.sel = '';
      card.hidden = false;
      card.innerHTML = '<div class="om-ch"><div class="om-cn"><b>この場所の ' + arr.length + '件</b><span class="om-cm">押すと、くわしく出ます</span></div><button type="button" class="om-x" aria-label="閉じる">×</button></div><ul class="om-gl">' +
        arr.map(function (it) { var g = G[it.g] || {}; return '<li><button type="button" data-id="' + esc(it.id) + '"><span class="om-ci sm" style="--c:' + g.color + '" aria-hidden="true">' + g.icon + '</span><span>' + esc(it.name) + (it.k === 'event' && it.next ? ' <small>' + md(it.next) + '</small>' : '') + '</span></button></li>'; }).join('') + '</ul>';
      sheetRoom();
    }
    function select(id, fromMap) {
      st.sel = id;
      if (id) hideHint();
      var it = byId[id];
      if (!it) { card.hidden = true; card.innerHTML = ''; drawPins(); markRows(); if (history.replaceState && location.hash) history.replaceState(null, '', location.pathname + location.search); return; }
      card.hidden = false; card.innerHTML = cardHTML(it); card.scrollTop = 0;
      drawPins(); markRows();
      if (!fromMap && map) {
        var r = mapEl.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) mapEl.scrollIntoView({ block: 'start' });
      }
      sheetRoom();
      if (map && typeof it.lat === 'number') panInto(it);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    }
    // スマホではカードが画面の下に出る。地図の下の端がカードの上に来るまでページを送る（ロゴもピンも隠さない）
    function sheetRoom() {
      if (getComputedStyle(card).position !== 'fixed') return;
      var top = window.innerHeight - card.offsetHeight, r = mapEl.getBoundingClientRect(), nav = 0;
      var bar = document.querySelector('.bvnav'); if (bar && /sticky|fixed/.test(getComputedStyle(bar).position)) nav = bar.getBoundingClientRect().bottom;
      var need = r.bottom - top; if (need > 0) window.scrollBy(0, Math.min(need, Math.max(0, r.top - nav - 4)));
    }
    function panInto(it) {
      var p = map.latLngToContainerPoint([it.lat, it.lng]), sz = map.getSize(), mr = mapEl.getBoundingClientRect();
      var top = 56, left = 30, right = sz.x - 56, bottom = sz.y - 36;
      if (getComputedStyle(card).position === 'fixed') bottom = Math.min(bottom, card.getBoundingClientRect().top - mr.top - 36);
      else if (!card.hidden) right = Math.min(right, card.getBoundingClientRect().left - mr.left - 30);   // 広い画面: カードは右。ピンはその左に
      if (bottom < top + 20) bottom = top + 20;
      if (right < left + 20) right = left + 20;
      var dx = p.x < left ? p.x - left : p.x > right ? p.x - right : 0;
      var dy = p.y < top ? p.y - top : p.y > bottom ? p.y - bottom : 0;
      if (dx || dy) map.panBy([dx, dy], { duration: 0.35 });
    }
    card.addEventListener('click', function (e) {
      if (e.target.closest('.om-x')) { select(''); return; }
      var mt = e.target.closest('.om-more-t');
      if (mt) { var d = mt.previousElementSibling; if (d) d.classList.remove('clamp'); mt.remove(); return; }
      var b = e.target.closest('button[data-id]');
      if (b) select(b.getAttribute('data-id'), true);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) select(''); });

    // ---- 一覧（しぼった中身を、近い順。催しは日付の順）---------------------------
    function rowHTML(it) {
      var g = G[it.g] || {}, d = dist(it);
      var sub = it.k === 'event' ? (it.next ? md(it.next) : '開催中〜' + md(it.until)) + (it.place ? '・' + it.place.replace(/[（(].*$/, '').replace(/。.*$/, '') : '') : (it.acc || '').split('／')[0];
      // 一覧の札は、状態から短く組み立てる（文の切り取りはしない）
      var TG = { closed: 'きょう休み', done: 'きょうは終了', open: 'きょう開いています' };
      var tag = it.today ? '<i class="om-tg ' + (it.today.on ? 'on' : 'off') + '">' + (it.today.kind === 'before' ? 'きょう ' + it.today.from + 'から' : TG[it.today.kind] || '') + '</i>' : '';
      if (st.now && !it.today && it.k === 'spot' && it.g !== 'park' && it.g !== 'train') tag += '<i class="om-tg na">休みの日は未確認</i>';
      if (it.k === 'event') tag = it.soon ? '<i class="om-tg ev">' + (it.next === today ? 'きょう' : 'あした') + '</i>' : !it.next ? '<i class="om-tg on">開催中</i>' : '';
      if (it.isNew) tag += '<i class="om-tg nw">新しく載せました</i>';
      else if (it.fresh) tag += '<i class="om-tg nw">前に見てから新しく</i>';
      if (st.age && !it.ages) {
        // カフェは年齢の目安を付けない（お店の設備だけを書く）。選んだ年齢に関係する設備を出す
        var want = { baby: ['おむつ替え', '授乳スペース', '子ども用の椅子', 'ベビーカーで入れる'], pre: ['キッズスペース・おもちゃ', '子どもメニュー', '座敷・小上がり・個室'], elem: ['キッズスペース・おもちゃ', '子どもメニュー'] }[st.age];
        var has = (it.tags || []).filter(function (t) { return want.indexOf(t) >= 0; });
        tag += '<i class="om-tg na">' + (has.length ? '設備: ' + esc(has.join('・')) : '年齢の目安なし（設備で選んで）') + '</i>';
      }
      return '<li><button type="button" class="om-row' + (st.sel === it.id ? ' on' : '') + (it.today && !it.today.on ? ' dim' : '') + '" data-id="' + esc(it.id) + '" id="r-' + esc(it.id) + '">' +
        '<span class="om-ci" style="--c:' + g.color + '" aria-hidden="true">' + g.icon + '</span>' +
        '<span class="om-rb"><b>' + esc(it.name) + (it.pr ? ' <i class="om-pr">PR</i>' : '') + '</b><small>' + esc(sub) + '</small>' + (tag ? '<span class="om-tgs">' + tag + '</span>' : '') + '</span>' +
        '<span class="om-rd">' + (d < 999 ? fmtKm(d) : '') + '</span></button></li>';
    }
    function drawList() {
      var vis = items.filter(function (it) { return ok(it); });
      var evMode = st.g === 'event';
      vis.sort(function (a, b) { return evMode ? a.order.localeCompare(b.order) || dist(a) - dist(b) : dist(a) - dist(b); });
      $('om-lt').textContent = evMode ? '日付の近い順' : st.baseName + 'から近い順';
      $('om-ln').textContent = vis.length;
      var hid = st.g ? [] : items.filter(function (it) { return it.k === 'event' && !evBrief(it) && ok(it, 'g'); });
      var nLater = hid.filter(function (it) { return it.next; }).length, nLong = hid.length - nLater;
      var ln = $('om-long');
      if (ln) { ln.hidden = !hid.length; ln.textContent = hid.length ? 'ほかに、' + [nLater ? '来週からの催し' + nLater + '件' : '', nLong ? '長く続く催し' + nLong + '件' : ''].filter(Boolean).join('・') + '（「催し」で出ます）' : ''; }
      var last = '', html = '';
      vis.slice(0, st.shown).forEach(function (it) {
        if (evMode) {
          var b = it.next === today ? 'きょう' : it.next === tomorrow ? 'あした' : it.next && it.next <= weekEnd ? 'この週末まで' : !it.next ? '開催中（期間のある催し）' : 'もっと先';
          if (b !== last) { html += '<li class="om-lb">' + b + '</li>'; last = b; }
        }
        html += rowHTML(it);
      });
      list.innerHTML = html || '<li class="om-none">この条件に合う場所はありません。条件をゆるめてみてください。</li>';
      var more = vis.length - st.shown;
      $('om-more').hidden = more <= 0;
      $('om-more').textContent = 'もっと見る（あと' + more + '件）';
    }
    function markRows() { list.querySelectorAll('.om-row').forEach(function (r) { r.classList.toggle('on', r.getAttribute('data-id') === st.sel); }); }
    list.addEventListener('click', function (e) { var r = e.target.closest('.om-row'); if (r) select(r.getAttribute('data-id')); });
    $('om-more').addEventListener('click', function () { st.shown += PAGE; drawList(); });

    // ---- しぼりこみ -----------------------------------------------------------
    function counts() {
      document.querySelectorAll('.om-chip').forEach(function (b) {
        var g = b.getAttribute('data-g'), c = items.filter(function (it) { return (!g || it.g === g) && ok(it, 'g') && (g || evBrief(it)); }).length;
        var cc = b.querySelector('.c'); if (cc) cc.textContent = c;
        b.setAttribute('aria-pressed', st.g === g ? 'true' : 'false');
        b.disabled = !c && st.g !== g;
      });
      document.querySelectorAll('.om-age button').forEach(function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-age') || '') === st.age ? 'true' : 'false'); });
      $('om-rain').setAttribute('aria-pressed', st.rain ? 'true' : 'false');
      $('om-now').setAttribute('aria-pressed', st.now ? 'true' : 'false');
    }
    function apply(refit) {
      st.shown = PAGE;
      if (st.sel) { var cur = byId[st.sel]; if (!cur || !ok(cur)) { st.sel = ''; card.hidden = true; } }
      counts(); drawList(); drawPins();
      if (refit) fit(st.g === 'event' || st.g === 'train' || st.g === 'water' ? 'all' : 'near'); else outside();
    }
    document.querySelector('.om-chips').addEventListener('click', function (e) {
      var b = e.target.closest('.om-chip'); if (!b || b.disabled) return;
      var g = b.getAttribute('data-g'); st.g = st.g === g ? '' : g; apply(true);
    });
    document.querySelector('.om-age').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      st.age = b.getAttribute('data-age') || ''; apply(false);
    });
    $('om-rain').addEventListener('click', function () { st.rain = !st.rain; apply(true); });
    $('om-now').addEventListener('click', function () { st.now = !st.now; apply(false); });

    // ---- 見る範囲のボタン ------------------------------------------------------
    document.querySelector('.om-ctl').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var v = b.getAttribute('data-v');
      if (v === 'geo') {
        if (!navigator.geolocation) { b.textContent = '📍 使えません'; return; }
        b.textContent = '📍 探しています…';
        navigator.geolocation.getCurrentPosition(function (p) {
          st.base = [p.coords.latitude, p.coords.longitude]; st.baseName = 'いまいる場所';
          b.textContent = '📍 いまいる場所';
          if (homeMark) { homeMark.setLatLng(st.base); var hm = homeMark.getElement(); if (hm) hm.querySelector('span').textContent = 'いまここ'; }
          drawList(); fit('near'); if (st.sel) select(st.sel, true);
        }, function () { b.textContent = '📍 位置が取れませんでした'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
        return;
      }
      if (v === 'home') {
        st.base = HOME; st.baseName = '花小金井駅';
        if (homeMark) { homeMark.setLatLng(HOME); var el = homeMark.getElement(); if (el) el.querySelector('span').textContent = '花小金井駅'; }
        drawList();
      }
      fit(v === 'all' ? 'all' : 'near');
    });
    if (map) map.on('moveend', outside);

    // ---- 地図へもどる（一覧を読み進めたとき）------------------------------------
    var back = $('om-top');
    if (back && 'IntersectionObserver' in global) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { back.hidden = e.isIntersecting || e.boundingClientRect.top > 0; }); }).observe(mapEl);
      back.addEventListener('click', function () { mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }

    function hideHint() { var h = $('om-hint'); if (h) h.classList.add('gone'); }
    setTimeout(hideHint, 5000);
    if (map) map.on('movestart', function () { if (map._loaded && !map._omFitting) hideHint(); });
    window.addEventListener('scroll', function () { if (window.scrollY > 60) hideHint(); }, { passive: true });

    // ---- 前に見てからふえたもの（読む人のブラウザにだけ覚える。消えていても困らない）------------------
    var seenLine = $('om-seen');
    try {
      var key = 'om-seen-v1', prev = JSON.parse(localStorage.getItem(key) || 'null'), ids = items.map(function (it) { return it.id; });
      if (prev && prev.ids && prev.d < today) {
        var old = {}; prev.ids.forEach(function (x) { old[x] = 1; });
        var fresh = items.filter(function (it) { return !old[it.id]; });
        fresh.forEach(function (it) { it.fresh = true; });
        if (seenLine && fresh.length) {
          var ne = fresh.filter(function (it) { return it.k === 'event'; }).length;
          seenLine.innerHTML = '<b>前に見た日（' + md(prev.d) + '）から ' + fresh.length + '件ふえました</b>' + (ne ? '（催し' + ne + '・場所' + (fresh.length - ne) + '）' : '');
          seenLine.hidden = false;
        }
      }
      if (!prev || prev.d < today) localStorage.setItem(key, JSON.stringify({ d: today, ids: ids }));
    } catch (e) { /* ブラウザが覚えられないときは出さない */ }

    // ---- はじめ ---------------------------------------------------------------
    counts(); drawList();
    if (map) { fit('near'); drawPins(); }
    var h = decodeURIComponent((location.hash || '').slice(1));
    if (h && byId[h]) { var hit = byId[h]; if (map && typeof hit.lat === 'number') map.setView([hit.lat, hit.lng], Math.max(map.getZoom(), 15)); select(h); }
    return map;
  }

  global.BVOdekake = { mount: mount };
})(window);
