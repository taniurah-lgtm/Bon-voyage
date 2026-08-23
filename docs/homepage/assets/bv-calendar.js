/* ぼんぼやーじゅ通信 — おでかけカレンダー（描画のみ）
 *
 * 使い方:
 *   BVCalendar.mount(el, data, { memberUrl, teaser })
 *     el    … 描画先の要素
 *     data  … { generated, events[], standing[], byDate{}, upcomingCount? }
 *     opts.teaser     … true なら「これは先14日ぶんです」の案内を出す（公開ページ用）
 *     opts.memberUrl  … 先の予定へのリンク先（公開ページ用）
 *
 * このファイルには予定の中身を持たない。データは
 *   - 公開ページ: data/events-public.json を fetch
 *   - 会員ページ: 合言葉で復号した中身の中の <script type="application/json"> から読む
 * ので、ここが公開されても会員限定の予定は出ない。
 */
(function (global) {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var MS_DAY = 86400000;

  // ---- 小道具 ---------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function parseISO(s) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function fmtDay(s) {
    var d = parseISO(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WD[d.getDay()] + ')';
  }
  function todayISO() { return iso(new Date()); }

  // ---- カレンダー登録リンク --------------------------------------------------
  // Googleカレンダーのテンプレートリンク。ログイン済みならワンタップで保存できる。
  function gcalURL(ev, date) {
    var dates;
    if (ev.start) {
      var s = date.replace(/-/g, '') + 'T' + ev.start.replace(':', '') + '00';
      var endT = ev.end || addHours(ev.start, 2);
      var endDate = date;
      // 終了が開始より前なら日付をまたいだと見なす
      if (endT < ev.start) endDate = iso(new Date(parseISO(date).getTime() + MS_DAY));
      dates = s + '/' + endDate.replace(/-/g, '') + 'T' + endT.replace(':', '') + '00';
    } else {
      // 終日。Googleの終日指定は終了日を翌日にする
      var next = iso(new Date(parseISO(date).getTime() + MS_DAY));
      dates = date.replace(/-/g, '') + '/' + next.replace(/-/g, '');
    }
    var q = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.name,
      dates: dates,
      ctz: 'Asia/Tokyo',
      location: ev.place || '',
      details: detailsText(ev),
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function addHours(hhmm, h) {
    var p = hhmm.split(':');
    var t = (Number(p[0]) + h) % 24;
    return pad(t) + ':' + p[1];
  }
  function detailsText(ev) {
    var out = [];
    if (ev.kidsNote) out.push(ev.kidsNote);
    else if (ev.summary) out.push(ev.summary);
    if (ev.cost) out.push('料金: ' + ev.cost);
    if (ev.target) out.push('対象: ' + ev.target);
    if (ev.deadline) out.push('申込: ' + ev.deadline.raw.replace(/^\s*-\s*/, ''));
    if (safeURL(ev.url)) out.push('🔗 ' + safeURL(ev.url));
    if (ev.mapq) out.push('📍 ' + mapURL(ev.mapq));
    out.push('— ぼんぼやーじゅ通信');
    return out.join('\n');
  }
  function mapURL(q) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  // href に入れてよいURLだけを通す。javascript: や data: は落とす。
  // 台帳側でも http(s) に限っているが、描画側でも止める（二重にする）。
  function safeURL(u) {
    return typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : '';
  }

  // iPhone / Apple カレンダー向けの .ics。Googleに入れたくない人の逃げ道。
  function icsBlobURL(ev, date) {
    var stamp = date.replace(/-/g, '');
    var body;
    if (ev.start) {
      var endT = ev.end || addHours(ev.start, 2);
      body =
        'DTSTART;TZID=Asia/Tokyo:' + stamp + 'T' + ev.start.replace(':', '') + '00\r\n' +
        'DTEND;TZID=Asia/Tokyo:' + stamp + 'T' + endT.replace(':', '') + '00\r\n';
    } else {
      var next = iso(new Date(parseISO(date).getTime() + MS_DAY)).replace(/-/g, '');
      body = 'DTSTART;VALUE=DATE:' + stamp + '\r\nDTEND;VALUE=DATE:' + next + '\r\n';
    }
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bonvoyage-tsushin//JP', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + ev.id + '-' + stamp + '@bonvoya.nicomaru.tokyo',
      'SUMMARY:' + icsEsc(ev.name),
      ev.place ? 'LOCATION:' + icsEsc(ev.place) : '',
      'DESCRIPTION:' + icsEsc(detailsText(ev)),
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean);
    var text = lines.slice(0, 5).join('\r\n') + '\r\n' + body + lines.slice(5).join('\r\n') + '\r\n';
    return URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  }
  function icsEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // ---- 年齢の目安 -----------------------------------------------------------
  function agesHTML(a) {
    if (!a) return '';
    var parts = [];
    if (a.baby) parts.push('👶' + esc(a.baby));
    if (a.pre) parts.push('🧒' + esc(a.pre));
    if (a.elem) parts.push('🎒' + esc(a.elem));
    return parts.length ? '<span class="bvc-ages">' + parts.join(' ') + '</span>' : '';
  }

  // ---- イベント1件のカード --------------------------------------------------
  // 台帳の日時欄に枠が2つ以上ある（「①…10:00〜12:00 ②…13:00〜16:00」「小学1・2年の部…／3・4年の部…」）
  // ときは、最初の枠だけを見出しに出すと別の枠に申し込む人には誤りになる。全文を併記する。
  function hasMultipleSlots(ev) {
    if (!ev.when) return false;
    var w = String(ev.when).replace(/[〜～]/g, '~');
    var ranges = w.match(/\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/g) || [];
    return ranges.length > 1 || /[①②③]|の部/.test(w);
  }

  function cardHTML(ev, date) {
    var multiSlot = hasMultipleSlots(ev);
    var when = ev.start ? ev.start + (ev.end ? '〜' + ev.end : '〜') : '時間は公式で確認';
    if (multiSlot) when = '枠が複数あります';
    var multi = ev.dates && ev.dates.length > 1 ? '<span class="bvc-multi">' + ev.dates.length + '日間のうち1日</span>' : '';
    var links =
      '<a class="bvc-btn bvc-btn-add" href="' + esc(gcalURL(ev, date)) + '" target="_blank" rel="noopener">📅 カレンダーに追加</a>' +
      '<button class="bvc-btn bvc-btn-ics" type="button" data-ics="' + esc(ev.id) + '" data-date="' + esc(date) + '">🍎 iPhoneに追加</button>' +
      (ev.mapq ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(mapURL(ev.mapq)) + '" target="_blank" rel="noopener">📍 地図</a>' : '') +
      (safeURL(ev.url) ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(safeURL(ev.url)) + '" target="_blank" rel="noopener">🔗 公式</a>' : '');
    var dl = ev.deadline
      ? '<p class="bvc-deadline">⏳ 申込 ' + esc(fmtDay(ev.deadline.date)) + ' まで</p>'
      : '';
    return (
      '<article class="bvc-card' + (ev.tentative ? ' is-tentative' : '') + '">' +
      '<p class="bvc-when">' + esc(when) + ' ' + multi + (ev.tentative ? '<span class="bvc-tent">日程は要確認</span>' : '') + '</p>' +
      '<h4 class="bvc-name">' + esc(ev.name) + '</h4>' +
      (multiSlot ? '<p class="bvc-slots">🕒 ' + esc(ev.when) + '</p>' : '') +
      (ev.place ? '<p class="bvc-place">' + esc(ev.place) + '</p>' : '') +
      (ev.summary ? '<p class="bvc-desc">' + esc(ev.summary) + '</p>' : '') +
      '<p class="bvc-meta">' + agesHTML(ev.ages) + (ev.cost ? '<span class="bvc-cost">' + esc(ev.cost) + '</span>' : '') + '</p>' +
      dl +
      '<div class="bvc-btns">' + links + '</div>' +
      '</article>'
    );
  }

  // ---- 本体 -----------------------------------------------------------------
  function mount(root, data, opts) {
    opts = opts || {};
    var events = data.events || [];
    var byId = {};
    events.forEach(function (e) { byId[e.id] = e; });

    // 日付 → イベント（確定のみ。暫定はマス目に置かない）
    var byDate = {};
    events.forEach(function (e) {
      if (e.tentative) return;
      (e.dates || []).forEach(function (d) { (byDate[d] = byDate[d] || []).push(e); });
    });

    var today = todayISO();
    var allDates = Object.keys(byDate).filter(function (d) { return d >= today; }).sort();
    var firstMonth = (allDates[0] || today).slice(0, 7);
    var months = uniq(Object.keys(byDate).filter(function (d) { return d >= today; }).map(function (d) { return d.slice(0, 7); })).sort();
    if (!months.length) months = [today.slice(0, 7)];
    var view = months.indexOf(today.slice(0, 7)) >= 0 ? today.slice(0, 7) : months[0];
    var selected = allDates[0] || null;

    root.innerHTML =
      '<div class="bvc">' +
      '<div class="bvc-deadlines" hidden></div>' +
      '<div class="bvc-head">' +
      '<button class="bvc-nav" type="button" data-go="-1" aria-label="前の月">‹</button>' +
      '<h3 class="bvc-month" aria-live="polite"></h3>' +
      '<button class="bvc-nav" type="button" data-go="1" aria-label="次の月">›</button>' +
      '</div>' +
      '<table class="bvc-grid"><thead><tr>' +
      WD.map(function (w, i) { return '<th class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table>' +
      '<div class="bvc-legend"><span class="bvc-dot"></span>予定あり　<span class="bvc-today-mark">今日</span></div>' +
      '<div class="bvc-day"></div>' +
      '<div class="bvc-tail"></div>' +
      '</div>';

    var $month = root.querySelector('.bvc-month');
    var $body = root.querySelector('.bvc-grid tbody');
    var $day = root.querySelector('.bvc-day');
    var $dl = root.querySelector('.bvc-deadlines');
    var $tail = root.querySelector('.bvc-tail');

    renderDeadlines();
    render();

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('.bvc-nav');
      if (nav) {
        var i = months.indexOf(view) + Number(nav.dataset.go);
        if (i >= 0 && i < months.length) { view = months[i]; render(); }
        return;
      }
      var cell = e.target.closest('.bvc-cell.has');
      if (cell) {
        selected = cell.dataset.date;
        render();
        $day.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      var ics = e.target.closest('.bvc-btn-ics');
      if (ics) {
        var ev = byId[ics.dataset.ics];
        if (!ev) return;
        var url = icsBlobURL(ev, ics.dataset.date);
        var a = document.createElement('a');
        a.href = url;
        a.download = ev.name.replace(/[\/\\?%*:|"<>]/g, '') + '.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }
    });

    function render() {
      var y = Number(view.slice(0, 4));
      var m = Number(view.slice(5, 7));
      $month.textContent = y + '年 ' + m + '月';
      root.querySelectorAll('.bvc-nav').forEach(function (b) {
        var i = months.indexOf(view) + Number(b.dataset.go);
        b.disabled = !(i >= 0 && i < months.length);
      });

      var first = new Date(y, m - 1, 1);
      var start = new Date(first);
      start.setDate(1 - first.getDay());          // その週の日曜まで戻す
      var rows = [];
      for (var w = 0; w < 6; w++) {
        var tds = [];
        var any = false;
        for (var d = 0; d < 7; d++) {
          var cur = new Date(start.getTime() + (w * 7 + d) * MS_DAY);
          var key = iso(cur);
          var inMonth = cur.getMonth() === m - 1;
          if (inMonth) any = true;
          var list = byDate[key] || [];
          var cls = ['bvc-cell'];
          if (!inMonth) cls.push('out');
          if (list.length) cls.push('has');
          if (key === today) cls.push('today');
          if (key === selected) cls.push('sel');
          if (key < today) cls.push('past');
          if (d === 0) cls.push('sun');
          if (d === 6) cls.push('sat');
          var dots = list.slice(0, 3).map(function () { return '<i class="bvc-dot"></i>'; }).join('');
          tds.push(
            '<td class="' + cls.join(' ') + '" data-date="' + key + '"' +
            (list.length ? ' tabindex="0" role="button" aria-label="' + fmtDay(key) + ' 予定' + list.length + '件"' : '') + '>' +
            '<span class="bvc-num">' + cur.getDate() + '</span>' +
            (list.length ? '<span class="bvc-dots">' + dots + (list.length > 3 ? '<i class="bvc-more">+</i>' : '') + '</span>' : '') +
            '</td>'
          );
        }
        if (any) rows.push('<tr>' + tds.join('') + '</tr>');
      }
      $body.innerHTML = rows.join('');
      renderDay();
    }

    function renderDay() {
      var list = selected ? byDate[selected] || [] : [];
      if (!list.length) {
        // 何も選ばれていないときは「この先の予定」を出す（空白より役に立つ）
        var up = allDates.slice(0, 4);
        $day.innerHTML =
          '<h4 class="bvc-dayhead">この先の予定</h4>' +
          (up.length
            ? up.map(function (d) {
                return '<p class="bvc-daylabel">' + esc(fmtDay(d)) + '</p>' +
                  byDate[d].map(function (e) { return cardHTML(e, d); }).join('');
              }).join('')
            : '<p class="bvc-empty">いまのところ、確定した予定はありません。</p>');
      } else {
        $day.innerHTML =
          '<h4 class="bvc-dayhead">' + esc(fmtDay(selected)) + 'の予定<span class="bvc-count">' + list.length + '件</span></h4>' +
          list.map(function (e) { return cardHTML(e, selected); }).join('');
      }
      renderTail();
    }

    function renderDeadlines() {
      // 締切が今日以降・3週間以内のものだけ。無ければ何も出さない。
      var soon = events
        .filter(function (e) { return e.deadline && e.deadline.date >= today; })
        .filter(function (e) { return (parseISO(e.deadline.date) - parseISO(today)) / MS_DAY <= 21; })
        .sort(function (a, b) { return a.deadline.date.localeCompare(b.deadline.date); });
      if (!soon.length) return;
      $dl.hidden = false;
      $dl.innerHTML =
        '<h4 class="bvc-dlhead">⏳ 申込の締切が近いもの</h4>' +
        soon.map(function (e) {
          var days = Math.round((parseISO(e.deadline.date) - parseISO(today)) / MS_DAY);
          return '<div class="bvc-dlrow"><span class="bvc-dldate">' + esc(fmtDay(e.deadline.date)) +
            (days === 0 ? '<b>今日</b>' : days <= 3 ? '<b>あと' + days + '日</b>' : '') + '</span>' +
            '<span class="bvc-dlname">' + esc(e.name) + '</span></div>';
        }).join('');
    }

    function renderTail() {
      var html = '';
      // 会期もの（「〜10/14まで」のように、日付ではなく期間で開いているもの）
      var spans = events.filter(function (e) { return e.span && (!e.span.to || e.span.to >= today); });
      if (spans.length) {
        html += '<h4 class="bvc-tailhead">📖 会期中ずっと見られるもの</h4>' +
          spans.map(function (e) {
            var label = e.span.to ? esc(fmtDay(e.span.to)) + 'まで' : '会期中';
            return '<article class="bvc-card"><p class="bvc-when">' + label + '</p>' +
              '<h4 class="bvc-name">' + esc(e.name) + '</h4>' +
              (e.place ? '<p class="bvc-place">' + esc(e.place) + '</p>' : '') +
              (e.summary ? '<p class="bvc-desc">' + esc(e.summary) + '</p>' : '') +
              '<p class="bvc-meta">' + agesHTML(e.ages) + (e.cost ? '<span class="bvc-cost">' + esc(e.cost) + '</span>' : '') + '</p>' +
              '<div class="bvc-btns">' +
              (e.mapq ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(mapURL(e.mapq)) + '" target="_blank" rel="noopener">📍 地図</a>' : '') +
              (safeURL(e.url) ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(safeURL(e.url)) + '" target="_blank" rel="noopener">🔗 公式</a>' : '') +
              '</div></article>';
          }).join('');
      }
      // 日程が確定していないもの（載せないより、存在を知らせるほうを優先する方針）
      var tent = events.filter(function (e) {
        return e.tentative && (e.dates || []).some(function (d) { return d >= today; });
      });
      if (tent.length) {
        html += '<h4 class="bvc-tailhead">🔎 日程がまだ確定していないもの</h4>' +
          '<p class="bvc-tailnote">例年の時期から拾ったものです。日付はカレンダーのマス目には入れていません。公式で確認してからお出かけください。</p>' +
          tent.map(function (e) {
            return '<div class="bvc-tentrow"><span class="bvc-tentwhen">' + esc(e.when || '') + '</span>' +
              '<span class="bvc-tentname">' + esc(e.name) + '</span>' +
              (safeURL(e.url) ? ' <a href="' + esc(safeURL(e.url)) + '" target="_blank" rel="noopener">公式</a>' : '') + '</div>';
          }).join('');
      }
      // いつでも行ける定番（プール・水遊び・常設）
      if ((data.standing || []).length) {
        html += '<h4 class="bvc-tailhead">🌊 いつでも行ける定番</h4>' +
          data.standing.map(function (s) {
            return '<article class="bvc-card"><p class="bvc-when">' + esc(s.span) + '</p>' +
              '<h4 class="bvc-name">' + esc(s.name) + '</h4>' +
              (s.summary ? '<p class="bvc-desc">' + esc(s.summary) + '</p>' : '') +
              '<p class="bvc-meta">' + agesHTML(s.ages) + (s.cost ? '<span class="bvc-cost">' + esc(s.cost) + '</span>' : '') + '</p>' +
              '<div class="bvc-btns">' +
              (s.mapq ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(mapURL(s.mapq)) + '" target="_blank" rel="noopener">📍 地図</a>' : '') +
              (safeURL(s.url) ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(safeURL(s.url)) + '" target="_blank" rel="noopener">🔗 公式</a>' : '') +
              '</div></article>';
          }).join('');
      }
      if (opts.teaser) {
        html +=
          '<div class="bvc-teaser">' +
          '<p>ここに出しているのは、<b>今日からの2週間ぶん</b>です。' +
          (typeof data.beyond === 'number' && data.beyond > 0
            ? 'このあと確定している予定が<b>' + data.beyond + '件</b>あります。'
            : '') +
          '先の予定まで通してご覧いただけるカレンダーは、応援サポーターの会員ページにあります。</p>' +
          (opts.memberUrl ? '<a class="bvc-teaser-link" href="' + esc(opts.memberUrl) + '">会員ページについて →</a>' : '') +
          '</div>';
      }
      $tail.innerHTML = html;
    }

    function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

    // キーボードでも日を選べるように。Enter/Space で決定、矢印キーで隣のマスへ。
    // 予定のある日だけが tabindex を持つので、矢印が無いと Tab を何十回も押すことになる。
    root.addEventListener('keydown', function (e) {
      var cell = e.target.closest && e.target.closest('.bvc-cell');
      if (!cell) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (cell.classList.contains('has')) { e.preventDefault(); cell.click(); }
        return;
      }
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
      if (!step) return;
      e.preventDefault();
      var cells = [].slice.call(root.querySelectorAll('.bvc-cell'));
      var i = cells.indexOf(cell);
      // 予定のある（=フォーカスできる）マスまで進む
      for (var j = i + step; j >= 0 && j < cells.length; j += step > 0 ? 1 : -1) {
        if (cells[j].classList.contains('has')) { cells[j].focus(); return; }
      }
    });
  }

  global.BVCalendar = { mount: mount };
})(window);
