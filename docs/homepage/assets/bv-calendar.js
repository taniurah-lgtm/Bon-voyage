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

  // その日の実際の開始・終了。台帳の「※23日は16:00まで」を反映する。
  // これを見ないと、読者のカレンダーに1時間ずれた終了時刻が入る。
  function timesFor(ev, date) {
    var ex = (ev.exceptions || {})[date] || {};
    var pg = (ev.programs || {})[date];
    if (pg) {
      // その日だけのプログラム。ほかの日には時刻を出さない
      return { start: pg.start, end: pg.end, program: pg.label, exception: false };
    }
    return { start: ex.start || ev.start, end: ex.end || ev.end, exception: !!(ex.start || ex.end) };
  }
  // 終了時刻が台帳に無いとき、カレンダーには何か入れないといけない。
  // 勝手に2時間で置くのは構わないが、置いたことを黙っていてはいけない。
  var GUESS_HOURS = 2;

  // ---- カレンダー登録リンク --------------------------------------------------
  // Googleカレンダーのテンプレートリンク。ログイン済みならワンタップで保存できる。
  function gcalURL(ev, date, slot) {
    var t = slot ? { start: slot.start, end: slot.end, exception: false } : timesFor(ev, date);
    var dates;
    if (t.start) {
      var s = date.replace(/-/g, '') + 'T' + t.start.replace(':', '') + '00';
      var endT = t.end || addHours(t.start, GUESS_HOURS);
      var endDate = date;
      // 終了が開始より前なら日付をまたいだと見なす
      if (endT < t.start) endDate = iso(new Date(parseISO(date).getTime() + MS_DAY));
      dates = s + '/' + endDate.replace(/-/g, '') + 'T' + endT.replace(':', '') + '00';
    } else {
      // 終日。Googleの終日指定は終了日を翌日にする
      var next = iso(new Date(parseISO(date).getTime() + MS_DAY));
      dates = date.replace(/-/g, '') + '/' + next.replace(/-/g, '');
    }
    var q = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.name + (slot && slot.label ? '（' + slot.label + '）' : ''),
      dates: dates,
      ctz: 'Asia/Tokyo',
      location: ev.place || '',
      details: detailsText(ev, date, slot),
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function addHours(hhmm, h) {
    var p = hhmm.split(':');
    var t = (Number(p[0]) + h) % 24;
    return pad(t) + ':' + p[1];
  }
  function detailsText(ev, date, slot) {
    var out = [];
    var t = date ? timesFor(ev, date) : { exception: false };
    // 未確認・推定はいちばん先に書く。読者のカレンダーに黙って入れない。
    if (ev.tentative) out.push('⚠️ 日程が未確定です。公式で確認してください');
    if (ev.timeUncertain) out.push('⚠️ 時間は例年の目安で、今年の確定時刻ではありません。公式で確認してください');
    if (ev.lastEntry) out.push(ev.lastEntry);
    if (t.program) out.push('この日は「' + t.program + '」の時間です（' + t.start + (t.end ? '〜' + t.end : '') + '）');
    if (!slot && t.start && !t.end) {
      out.push('⚠️ 終了時刻は公表されていません。カレンダーには' + GUESS_HOURS + '時間で仮置きしています');
    }
    if (ev.caution) out.push('⚠️ ' + ev.caution);
    if (slot && slot.label) out.push('枠: ' + slot.label + '（' + slot.start + '〜' + slot.end + '）');
    if (t.exception) out.push('この日は ' + (t.start || ev.start || '') + '〜' + (t.end || '') + ' です');
    if (ev.kidsNote) out.push(ev.kidsNote);
    else if (ev.summary) out.push(ev.summary);
    if (ev.cost) out.push('料金: ' + ev.cost);
    if (ev.target) out.push('対象: ' + ev.target);
    if (ev.deadline) out.push('申込: ' + ev.deadline.raw);
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

  // 1日ぶんの VEVENT。まとめ保存でも同じ形を使い回す。
  function icsEvent(ev, date, slot) {
    var stamp = date.replace(/-/g, '');
    var t = slot ? { start: slot.start, end: slot.end, exception: false } : timesFor(ev, date);
    var when;
    if (t.start) {
      var endT = t.end || addHours(t.start, GUESS_HOURS);
      when = [
        'DTSTART;TZID=Asia/Tokyo:' + stamp + 'T' + t.start.replace(':', '') + '00',
        'DTEND;TZID=Asia/Tokyo:' + stamp + 'T' + endT.replace(':', '') + '00',
      ];
    } else {
      var next = iso(new Date(parseISO(date).getTime() + MS_DAY)).replace(/-/g, '');
      when = ['DTSTART;VALUE=DATE:' + stamp, 'DTEND;VALUE=DATE:' + next];
    }
    // DTSTAMP は RFC 5545 の必須項目。無いと取り込みを拒むカレンダーがある。
    var now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
      'BEGIN:VEVENT',
      'DTSTAMP:' + now,
      // ★日・枠ごとに UID を分ける。同じ UID は「同じ予定の更新」なので、
      //   2件目を取り込むと1件目が消える（兄弟で別の部に申し込む家庭で困る）。
      'UID:' + ev.id + '-' + stamp + (slot ? '-' + slot.start.replace(':', '') : '') + '@bonvoya.nicomaru.tokyo',
      'SUMMARY:' + icsEsc(ev.name + (slot && slot.label ? '（' + slot.label + '）' : '')),
      ev.place ? 'LOCATION:' + icsEsc(ev.place) : '',
      'DESCRIPTION:' + icsEsc(detailsText(ev, date, slot)),
    ].filter(Boolean).concat(when, ['END:VEVENT']);
  }

  // カレンダーのファイル(.ics)。iPhone/Apple はもちろん、Google に直接入れたくない人の逃げ道。
  // dates に複数渡すと、その日ぶんをまとめて1つのファイルに入れる
  //（5日間の催しを1日ずつ登録させるのは手間なので）。
  function icsBlobURL(ev, dates, slot) {
    var list = Array.isArray(dates) ? dates : [dates];
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bonvoyage-tsushin//JP', 'CALSCALE:GREGORIAN',
      // TZID を使うなら VTIMEZONE の定義が必要（厳格なパーサが弾く）。日本は夏時間なし。
      'BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo',
      'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900',
      'TZNAME:JST', 'END:STANDARD', 'END:VTIMEZONE',
    ];
    list.forEach(function (d) { lines = lines.concat(icsEvent(ev, d, slot)); });
    lines.push('END:VCALENDAR');
    return URL.createObjectURL(new Blob([foldICS(lines.join('\r\n') + '\r\n')], { type: 'text/calendar;charset=utf-8' }));
  }
  // RFC 5545 は1行75オクテットまで。超える行は CRLF + 空白1つで折り返す。
  // マルチバイト文字の途中で切らないよう、UTF-8のバイト数で数える。
  function foldICS(text) {
    return text.split('\r\n').map(function (line) {
      var bytes = new TextEncoder().encode(line);
      if (bytes.length <= 75) return line;
      var out = [], cur = '', curLen = 0, limit = 75;
      for (var ch of line) {
        var n = new TextEncoder().encode(ch).length;
        if (curLen + n > limit) { out.push(cur); cur = ''; curLen = 0; limit = 74; }
        cur += ch; curLen += n;
      }
      if (cur) out.push(cur);
      return out.join('\r\n ');
    }).join('\r\n');
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
    if (parts.length) return '<span class="bvc-ages">' + parts.join(' ') + '</span>';
    // 古い書式は年齢ごとに分かれておらず、総合評価だけ。
    // ★否定的な評価（✕に近い△）を落とすと、混雑が激しい催しが中立に見える。
    if (a.overall) {
      var hard = /✕|x/.test(a.overall);
      return '<span class="bvc-ages' + (hard ? ' is-hard' : '') + '">子連れ ' + esc(a.overall) +
        (hard ? '（混雑が激しく、小さい子には負担）' : '') + '</span>';
    }
    return '';
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

  // 「①体験会 10:00~12:00 ②交流大会 13:00~16:00」「小学1・2年の部 9:30~11:30 / 3・4年の部 13:00~15:00」
  // を、名前つきの枠に割る。
  function padTime(t) {
    var p = String(t).split(':');
    return pad(p[0]) + ':' + p[1];
  }

  // 「9/22(火)23(水)ほおずき市17:00~21:00、9/24(木)25(金)阿波踊り19:00~21:00」のような
  // 書き方から、枠（時間帯）とその枠がどの日のものかを取り出す。
  // ★日付を落としてはいけない。前は時刻だけを持っていたため、会期4日ぜんぶに
  //   両方のボタンが出て、「25(金)阿波踊り」を押すと 9/22 が登録された
  //   （ボタンの文字と、実際にカレンダーに入る日が食い違っていた）。
  function parseSlots(when, dates) {
    if (!when) return [];
    var w = String(when).replace(/[〜～]/g, '~');
    var out = [];
    var re = /([^\/／、,]*?)\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/g;
    var m;
    var lastEnd = 0;
    while ((m = re.exec(w)) !== null) {
      var head = m[1] || '';
      // その枠の直前の文（前の枠の終わりから、この枠の時刻まで）に出てくる日付を集める
      var seg = w.slice(lastEnd, m.index + head.length);
      lastEnd = re.lastIndex;
      // 先頭の日付や丸数字は、何個あっても落とす。1回だけだと
      // 「9/22(火)23(水)ほおずき市」→「23(水)ほおずき市」と、選んだ日と違う日付が
      // ボタンの文字に残る（登録される日は正しくても、読む人が混乱する）。
      var label = head;
      for (var g = 0; g < 6; g++) {
        var before = label;
        label = label
          .replace(/^[\s・･、,①②③④⑤⑥]+/, '')
          .replace(/^\d{1,2}\s*\/\s*\d{1,2}\s*(?:\([^)]*\))?\s*/, '')   // 「9/6(日) 」
          .replace(/^\d{1,2}\s*\([^)]*\)\s*/, '');                     // 「6(日) 」
        if (label === before) break;
      }
      label = label.replace(/[\s・･]+$/, '').trim();
      out.push({
        label: label || m[2] + 'の回',
        start: padTime(m[2]),
        end: padTime(m[3]),
        dates: slotDates(seg, dates),
      });
    }
    return out;
  }

  // 文の中の「9/22」「22(火)」を、その催しが持っている日付に突き合わせる。
  // 突き合わない（日付の手がかりが無い）ときは空にして、全日に出す扱いにする。
  function slotDates(seg, dates) {
    if (!dates || !dates.length) return [];
    var hits = [];
    var re = /(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2})\s*\(/g;
    var m, lastMonth = null;
    while ((m = re.exec(seg)) !== null) {
      var mo, da;
      if (m[1]) { mo = Number(m[1]); da = Number(m[2]); lastMonth = mo; }
      else { mo = lastMonth; da = Number(m[3]); }
      dates.forEach(function (d) {
        var pm = Number(d.slice(5, 7)), pd = Number(d.slice(8, 10));
        if (pd === da && (mo == null || pm === mo) && hits.indexOf(d) < 0) hits.push(d);
      });
    }
    return hits;
  }

  function cardHTML(ev, date, opt) {
    var hName = (opt && opt.hName) || 'h5';   // 予定名の見出しの深さ（置かれ方で変わる）
    var past = opt && opt.past;
    var multiSlot = hasMultipleSlots(ev);
    var t = timesFor(ev, date);
    var when = '';
    // 枠が複数あるとき、1つのボタンで先頭の枠だけを入れると別の枠の人には誤りになる。
    // 枠ごとにボタンを分ける（「1・2年の部」「3・4年の部」など）。
    // ★その日に当たる枠だけに絞る。日付の手がかりが無い枠（「①体験会 10:00〜」など）は
    //   どの日にも出す。絞った結果が1つ以下なら、ふつうの1本のボタンに戻す。
    var allSlots = multiSlot ? parseSlots(ev.when, ev.dates) : [];
    var slots = allSlots.filter(function (sl) {
      return !sl.dates.length || sl.dates.indexOf(date) >= 0;
    });
    // ★「枠が複数あります」は、実際に枠が2つ以上取れたときだけ言う。
    //   前は 丸数字や「の部」があるだけで真になり、枠が1つも取れないのに
    //   時刻が見出しから消えていた（E53「①9/29(火) ②10/13(火) 10:00〜正午」）。
    // その日に当たる枠がちょうど1つなら、その枠の時刻をその日の時刻として使う
    // （「9/22 はほおずき市 17:00〜21:00」のように、日ごとに時間が違う催し）。
    var only = slots.length === 1 && allSlots.length > 1 && slots[0].dates.length ? slots[0] : null;
    if (only) { t = { start: only.start, end: only.end, exception: false, program: only.label }; }
    if (slots.length > 1) when = '枠が複数あります';
    else if (only) when = only.label + ' ' + only.start + '〜' + only.end;
    else if (t.program) when = t.program + ' ' + t.start + (t.end ? '〜' + t.end : '〜');
    else when = t.start ? t.start + (t.end ? '〜' + t.end : '〜') : '時間は公式で確認';
    var multi = ev.dates && ev.dates.length > 1 ? '<span class="bvc-multi">' + ev.dates.length + '日間のうち1日</span>' : '';
    var addBtns = slots.length > 1
      ? slots.map(function (sl, i) {
          return '<span class="bvc-slotpair">' +
            '<a class="bvc-btn bvc-btn-add" href="' + esc(gcalURL(ev, date, sl)) +
            '" target="_blank" rel="noopener"' +
            ' aria-label="' + esc(ev.name + ' ' + sl.label) + 'を Google カレンダーに追加">📅 ' + esc(sl.label) + '</a>' +
            // 枠ごとに .ics も出す。締切のある催しほど保存したい
            '<button class="bvc-btn bvc-btn-ics" type="button" data-ics="' + esc(ev.id) +
            '" data-date="' + esc(date) + '" data-slot="' + i + '"' +
            ' aria-label="' + esc(ev.name + ' ' + sl.label) + 'をカレンダーのファイル(.ics)で保存">📄 .ics</button>' +
            '</span>';
        }).join('')
      // ★読み上げ用の名前を必ず付ける。付けないと、その日の予定が5件あるとき
      //   「カレンダーに追加」だけが5個並び、どれがどの予定か分からない。
      : '<a class="bvc-btn bvc-btn-add" href="' + esc(gcalURL(ev, date, only)) + '" target="_blank" rel="noopener"' +
        ' aria-label="' + esc(ev.name) + 'を Google カレンダーに追加">📅 カレンダーに追加</a>' +
        '<button class="bvc-btn bvc-btn-ics" type="button" data-ics="' + esc(ev.id) + '" data-date="' + esc(date) + '"' +
        (only ? ' data-slot="0"' : '') +
        // 実際の動きは「.ics を保存してから開く」。「追加」と書くと、押しても
        // カレンダーに入らないように見える。
        ' aria-label="' + esc(ev.name) + 'をカレンダーのファイル(.ics)で保存">📄 ファイルで保存</button>';
    // 5日間の催しを1日ずつ登録させるのは手間（「利用者に手間がないように」）。
    // 残っている日をまとめて1ファイルにするボタンを、複数日のものだけに出す。
    var nowKey = todayISO();
    var restDays = (ev.dates || []).filter(function (d) { return d >= nowKey; });
    var allBtn = (slots.length <= 1 && restDays.length > 1)
      ? '<button class="bvc-btn bvc-btn-ics bvc-btn-all" type="button" data-ics="' + esc(ev.id) +
        '" data-date="' + esc(date) + '" data-all="1"' +
        ' aria-label="' + esc(ev.name) + 'の残り' + restDays.length + '日ぶんをカレンダーのファイル(.ics)にまとめて保存">' +
        '📄 ' + restDays.length + '日ぶんまとめて</button>'
      : '';
    // 終わった予定にカレンダー登録は出さない。ただし地図と公式は残す。
    // 「過ぎた日も残しているのが有料の値打ち」と言っているのに、来年の下見に
    // 使いたい人が公式ページにも地図にも行けないのはおかしい。
    var subLinks =
      (ev.mapq ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(mapURL(ev.mapq)) + '" target="_blank" rel="noopener">📍 地図</a>' : '') +
      (safeURL(ev.url) ? '<a class="bvc-btn bvc-btn-sub" href="' + esc(safeURL(ev.url)) + '" target="_blank" rel="noopener">🔗 公式</a>' : '');
    var links = past ? subLinks : addBtns + allBtn + subLinks;
    var dl = ev.deadline
      ? '<p class="bvc-deadline">⏳ 申込 ' + esc(fmtDay(ev.deadline.date)) + ' まで</p>'
      : '';
    return (
      '<article class="bvc-card' + (ev.tentative ? ' is-tentative' : '') + (past ? ' is-past' : '') + '">' +
      (past ? '<p class="bvc-past-label">この日は終わりました</p>' : '') +
      '<p class="bvc-when">' + esc(when) + ' ' + multi +
      (t.exception ? '<span class="bvc-exc">この日だけ時間がちがいます</span>' : '') +
      (slots.length <= 1 && t.start && !t.end && !ev.timeUncertain ? '<span class="bvc-exc">終了時刻は未公表</span>' : '') +
      (ev.timeUncertain && !t.program ? '<span class="bvc-tent">時間は要確認（例年の目安）</span>' : '') +
      (ev.tentative ? '<span class="bvc-tent">日程は要確認</span>' : '') + '</p>' +
      '<' + hName + ' class="bvc-name">' + esc(ev.name) + '</' + hName + '>' +
      (slots.length > 1 ? '<p class="bvc-slots">🕒 ' + esc(ev.when) + '</p>' : '') +
      (ev.place ? '<p class="bvc-place">' + esc(ev.place) + '</p>' : '') +
      (ev.summary ? '<p class="bvc-desc">' + esc(ev.summary) + '</p>' : '') +
      // 子連れの注意は行く前に読めないと意味がない（登録の説明欄だけでは遅い）
      // 開催日が多いものの子連れメモは催し全体の話なので、その日の説明と読み違えないようにする
      //（8/29に「お盆期間の平日に行けるのが強み」と出て矛盾していた）
      (ev.kidsNote && ev.kidsNote !== ev.summary
        ? '<p class="bvc-kids">' +
          ((ev.totalDates || (ev.dates || []).length) > 3 ? '<span class="bvc-kidslabel">この催しについて</span>' : '') +
          esc(ev.kidsNote) + '</p>' : '') +
      '<p class="bvc-meta">' + agesHTML(ev.ages) + (ev.cost ? '<span class="bvc-cost">' + esc(ev.cost) + '</span>' : '') + '</p>' +
      (ev.lastEntry ? '<p class="bvc-caution">🚪 ' + esc(ev.lastEntry) + '</p>' : '') +
      (ev.target ? '<p class="bvc-target">👥 ' + esc(ev.target) + '</p>' : '') +
      (ev.hours ? '<p class="bvc-hours">🕘 ' + esc(ev.hours) + '</p>' : '') +
      (ev.caution ? '<p class="bvc-caution">⚠️ ' + esc(ev.caution) + '</p>' : '') +
      dl +
      '<div class="bvc-btns">' + links + '</div>' +
      '</article>'
    );
  }

  // ---- 本体 -----------------------------------------------------------------
  function mount(root, data, opts) {
    opts = opts || {};
    // 見出しは飛ばさない。月＝hTag、日や節＝その1つ下、予定名＝さらに1つ下。
    // 公開ページは上に h2 が無いので月を h2 にする（h1→h3 は飛びになる）。
    var lv = opts.monthLevel === 2 ? 2 : 3;
    var hTag = 'h' + lv;          // 2026年 8月
    var hSub = 'h' + (lv + 1);    // 8月29日(土)の予定 ／ ⏳ 申込の締切…
    var hName = 'h' + (lv + 2);   // 予定の名前
    var events = data.events || [];
    var byId = {};
    events.forEach(function (e) { byId[e.id] = e; });

    // 日付 → イベント（確定のみ。暫定はマス目に置かない）
    var byDate = {};
    events.forEach(function (e) {
      if (e.tentative) return;
      (e.dates || []).forEach(function (d) { (byDate[d] = byDate[d] || []).push(e); });
    });
    // 同じ日の中は「子連れで行きやすい順」に並べる。台帳の順（IDや日付）だと
    // その日いちばんの一推しが最後に出てしまう。
    function kidScore(e) {
      var a = e.ages || {};
      var pt = { '◎': 3, '○': 2, '△': 1, '✕': 0, x: 0 };
      if (a.baby || a.pre || a.elem) {
        return (pt[a.baby] || 0) + (pt[a.pre] || 0) + (pt[a.elem] || 0);
      }
      // 古い書式（総合評価だけ）。3カテゴリぶんに換算して同じ尺度に乗せる。
      // ここを見ないと ages=null の同点になり、混雑の激しい催しが上に来る。
      if (a.overall) {
        if (/✕|x/.test(a.overall)) return 0;
        if (/^◎/.test(a.overall)) return 9;
        if (/△\s*[〜~]\s*○|○\s*[〜~]\s*△/.test(a.overall)) return 4;
        if (/^○/.test(a.overall)) return 6;
        if (/^△/.test(a.overall)) return 3;
      }
      return 1;   // 目安が無いものは、目安があるものより後ろに
    }
    Object.keys(byDate).forEach(function (d) {
      byDate[d].sort(function (a, b) {
        var diff = kidScore(b) - kidScore(a);
        if (diff) return diff;
        // 同点なら無料を先に、次に開始が早いものを先に
        var freeA = /無料/.test(a.cost || '') ? 1 : 0;
        var freeB = /無料/.test(b.cost || '') ? 1 : 0;
        if (freeA !== freeB) return freeB - freeA;
        return String(a.start || '99:99').localeCompare(String(b.start || '99:99'));
      });
    });

    var today = todayISO();
    // 公開ページは今日からの2週間ぶんしか持っていないので、過去の月を出す意味がない。
    // 会員ページは台帳の全期間を持っており、「台帳の予定をぜんぶ」と書いている。
    // ★ここを today で切っていたため、7月の11件（台帳の26%）が暗号の中にあるのに
    //   月送りボタンが8月で止まり、UIから開けなかった（「ぜんぶ」が嘘になっていた）。
    function inRange(d) { return opts.teaser ? d >= today : true; }
    var allDates = Object.keys(byDate).filter(inRange).sort();
    var firstMonth = (allDates[0] || today).slice(0, 7);
    var months = uniq(Object.keys(byDate).filter(inRange).map(function (d) { return d.slice(0, 7); })).sort();
    if (!months.length) months = [today.slice(0, 7)];
    var view = months.indexOf(today.slice(0, 7)) >= 0 ? today.slice(0, 7) : months[0];
    // 「今週末どこ行こう」が主な用なので、平日に開いたら次の土日を選んでおく。
    // 土日に開いたときはその日のまま。
    function nextWeekendWithEvents() {
      var d0 = parseISO(today);
      for (var i = 0; i <= 13; i++) {
        var d = new Date(d0.getTime() + i * MS_DAY);
        var wd = d.getDay();
        if (wd !== 0 && wd !== 6) continue;
        var key = iso(d);
        if (byDate[key] && byDate[key].length) return key;
      }
      return null;
    }
    var selected = (byDate[today] && byDate[today].length && /[06]/.test(String(parseISO(today).getDay())))
      ? today
      // allDates には過去の日も入る（会員ページ）。最初に選ぶのは今日以降にする。
      : (nextWeekendWithEvents() || allDates.filter(function (d) { return d >= today; })[0] || allDates[0] || null);
    if (selected && selected.slice(0, 7) !== view && months.indexOf(selected.slice(0, 7)) >= 0) {
      view = selected.slice(0, 7);
    }

    root.innerHTML =
      '<div class="bvc">' +
      // 締切の枠はグリッドの下に置く。上に置くと「今週末どこ行こう」に
      // たどり着くまで1.8画面ぶんスクロールが必要だった。
      '<div class="bvc-head">' +
      '<button class="bvc-nav" type="button" data-go="-1" aria-label="前の月">‹</button>' +
      // 見出しの深さは置かれ方で変わる。会員ページは「📅 おでかけカレンダー」(h2) の
      // 下にあるので h3、公開ページは上に h2 が無いので h2（h1→h3 は飛びになる）。
      '<' + hTag + ' class="bvc-month" aria-live="polite"></' + hTag + '>' +
      '<button class="bvc-nav" type="button" data-go="1" aria-label="次の月">›</button>' +
      '</div>' +
      '<div class="bvc-quick"><button class="bvc-jump" type="button" data-jump="weekend">今週末を見る</button>' +
      '<button class="bvc-jump" type="button" data-jump="today">今日</button></div>' +
      // 今日・3日以内の締切だけは上に出す。下の枠は4画面ぶん下にあって、
      // 当日締切に気づけなかった。
      '<div class="bvc-deadlines bvc-dl-urgent" hidden></div>' +
      '<table class="bvc-grid"><thead><tr>' +
      WD.map(function (w, i) { return '<th class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table>' +
      '<p class="bvc-key">👶 あかちゃん(0-2) ／ 🧒 未就学(3-6) ／ 🎒 小学生　' +
      '<b>◎</b> ぴったり ／ <b>○</b> だいじょうぶ ／ <b>△</b> ひと工夫</p>' +
      '<div class="bvc-legend"><span class="bvc-dot"></span>予定あり　' +
      // 会員ページは過ぎた日にも中空の点を出す。凡例に無いと、何の印か分からない。
      (opts.teaser ? '' : '<span class="bvc-dot is-past"></span>終わった予定　') +
      '<span class="bvc-today-mark">今日</span>' +
      (opts.teaser && data.window
        ? '<span class="bvc-window">公開ぶんは ' + esc(fmtDay(data.window.to)) + ' まで</span>'
        : '') +
      '</div>' +
      '<div class="bvc-day"></div>' +
      '<div class="bvc-deadlines" hidden></div>' +
      '<div class="bvc-tail"></div>' +
      '</div>';

    var $month = root.querySelector('.bvc-month');
    var $body = root.querySelector('.bvc-grid tbody');
    var $day = root.querySelector('.bvc-day');
    var $dlTop = root.querySelector('.bvc-dl-urgent');
    var $dl = root.querySelector('.bvc-deadlines:not(.bvc-dl-urgent)');
    var $tail = root.querySelector('.bvc-tail');

    renderDeadlines();
    render();

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('.bvc-nav');
      if (nav) {
        var i = months.indexOf(view) + Number(nav.dataset.go);
        if (i >= 0 && i < months.length) {
          view = months[i];
          // 下の予定リストが前の月のまま残らないように、その月の最初の予定へ移す
          if (!selected || selected.slice(0, 7) !== view) {
            var first = allDates.filter(function (d) { return d.slice(0, 7) === view; })[0];
            selected = first || null;
          }
          render();
        }
        return;
      }
      var jump = e.target.closest('.bvc-jump');
      if (jump) {
        var to = jump.dataset.jump === 'today' ? today : nextWeekendWithEvents();
        if (to) {
          selected = to;
          if (months.indexOf(to.slice(0, 7)) >= 0) view = to.slice(0, 7);
          render();
          $day.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      var alert = e.target.closest('.bvc-dlalert');
      if (alert) {
        $dl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var cell = e.target.closest('.bvc-cell:not(.out)');
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
        var sl = null;
        if (ics.dataset.slot != null) {
          // ★カード側と同じ絞り込みをする。絞る前の番号で引くと、別の枠が保存される。
          var ss = parseSlots(ev.when, ev.dates).filter(function (x) {
            return !x.dates.length || x.dates.indexOf(ics.dataset.date) >= 0;
          });
          sl = ss[Number(ics.dataset.slot)] || null;
        }
        // data-all があれば、その催しの残っている日ぶんをまとめて1ファイルにする
        var target = ics.dataset.all
          ? (ev.dates || []).filter(function (d) { return d >= today; })
          : ics.dataset.date;
        var url = icsBlobURL(ev, target, sl);
        var a = document.createElement('a');
        a.href = url;
        // ★ファイル名は ASCII にする。日本語を入れると、ブラウザが download 属性を
        //   捨てて拡張子なしの「download」で保存することがあり、そうなると
        //   カレンダーに取り込めない（Chromium で実測：漢字・カタカナ・é すべて失敗）。
        a.download = 'bonvoyage-' + String(ev.id || 'ev').replace(/[^A-Za-z0-9]/g, '') +
          '-' + String(ics.dataset.date).replace(/-/g, '') +
          (sl ? '-' + sl.start.replace(':', '') : '') +
          (ics.dataset.all ? '-all' : '') + '.ics';
        document.body.appendChild(a);
        a.click();
        // 保存が始まる前に blob を捨てると空ファイルになるブラウザがあるので、少し待って片づける
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      }
    });


    // 公開ページは今日から2週間ぶんしか持っていない。その外の日を「予定なし」と
    // 言うと嘘になる（手前＝終わったぶん、先＝まだ出していないぶん）。
    function outWindow(key) {
      if (!opts.teaser || !data.window) return '';
      if (key < data.window.from) return 'past';
      if (key > data.window.to) return 'ahead';
      return '';
    }
    function render() {
      var y = Number(view.slice(0, 4));
      var m = Number(view.slice(5, 7));
      $month.textContent = y + '年 ' + m + '月';
      root.querySelectorAll('.bvc-nav').forEach(function (b) {
        var i = months.indexOf(view) + Number(b.dataset.go);
        b.disabled = !(i >= 0 && i < months.length);
      });

      // 窓の外の日は「予定なし」と言ってはいけない（本当は予定があるのに読み上げが嘘になる）
      // ★先だけでなく手前も見る。前は to 側だけを見ていたので、8/22 のように
      //   トップページには載っている日が、カレンダーでは「予定なし」になっていた。
      function dayLabel(key, list) {
        var w = outWindow(key);
        if (w) return w === 'past' ? ' 公開ぶんより前' : ' 公開ぶんの外';
        return list.length ? ' 予定' + list.length + '件' : ' 予定なし';
      }

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
          else cls.push('tap');            // 月内はどの日も押せる（押して無反応をなくす）
          if (list.length && inMonth && key >= today) cls.push('has');
          if (key === today) cls.push('today');
          if (key === selected) cls.push('sel');
          if (key < today) cls.push('past');
          if (d === 0) cls.push('sun');
          if (d === 6) cls.push('sat');
          // 隣月・過去日は点を出さない（押せないのに「予定あり」に見える／今週末を探す邪魔になる）
          // 会員ページは過ぎた日も持っている（それが有料の値打ち）。点を出さないと、
          // 読み上げだけが「予定6件」と言い、目で見ている人には空の日と同じに見える。
          // 公開ページは今日より前を持っていないので、これまでどおり出さない。
          var showDots = inMonth && (key >= today || !opts.teaser);
          var pastDot = key < today ? ' is-past' : '';
          var dots = showDots
            ? list.slice(0, 3).map(function () { return '<i class="bvc-dot' + pastDot + '"></i>'; }).join('')
            : '';
          tds.push(
            '<td class="' + cls.join(' ') + '" data-date="' + key + '"' +
            (inMonth
              ? ' tabindex="' + (key === selected ? '0' : '-1') + '" role="button" aria-label="' +
                fmtDay(key) + dayLabel(key, list) + '"'
              : '') + '>' +
            '<span class="bvc-num">' + cur.getDate() + '</span>' +
            (showDots && list.length ? '<span class="bvc-dots">' + dots + (list.length > 3 ? '<i class="bvc-more' + pastDot + '">+</i>' : '') + '</span>' : '') +
            '</td>'
          );
        }
        if (any) rows.push('<tr>' + tds.join('') + '</tr>');
      }
      var hadFocus = document.activeElement && document.activeElement.classList &&
        document.activeElement.classList.contains('bvc-cell');
      $body.innerHTML = rows.join('');
      // 再描画でフォーカスが body に飛ぶと、矢印キーで続けて日を動かせない
      if (hadFocus && selected) {
        var cell = $body.querySelector('.bvc-cell[data-date="' + selected + '"]');
        if (cell) cell.focus();
      }
      renderDay();
    }

    function renderDay() {
      var list = selected ? byDate[selected] || [] : [];
      // 日を選んでいるのに予定が無いとき（押して無反応に見えないよう、はっきり言う）
      if (selected && !list.length) {
        var w = outWindow(selected);
        var outMsg =
          w === 'past'
            ? 'この日は、公開しているぶん（今日からの2週間）より前です。終わった予定は公開ぶんに載せていないので、' +
              '予定が無かったという意味ではありません。' +
              (opts.memberUrl ? ' <a href="' + esc(opts.memberUrl) + '">会員ページ</a>では過ぎた日も残しています。' : '')
            : 'この日は、公開しているぶん（今日からの2週間）の外です。予定が無いという意味ではありません。' +
              (opts.memberUrl ? ' <a href="' + esc(opts.memberUrl) + '">会員ページ</a>では先の予定まで見られます。' : '');
        $day.innerHTML =
          '<' + hSub + ' class="bvc-dayhead">' + esc(fmtDay(selected)) + '</' + hSub + '>' +
          '<p class="bvc-empty">' + (w ? outMsg : 'この日に入っている予定はありません。') + '</p>';
        renderTail();
        return;
      }
      if (!list.length) {
        // 何も選ばれていないときは「この先の予定」を出す（空白より役に立つ）
        var up = allDates.slice(0, 4);
        $day.innerHTML =
          '<' + hSub + ' class="bvc-dayhead">この先の予定' + '</' + hSub + '>' +
          (up.length
            ? up.map(function (d) {
                return '<p class="bvc-daylabel">' + esc(fmtDay(d)) + '</p>' +
                  byDate[d].map(function (e) { return cardHTML(e, d, { hName: hName }); }).join('');
              }).join('')
            : '<p class="bvc-empty">いまのところ、確定した予定はありません。</p>');
      } else {
        $day.innerHTML =
          '<' + hSub + ' class="bvc-dayhead">' + esc(fmtDay(selected)) +
          (selected < today ? 'に終わった予定' : 'の予定') +
          '<span class="bvc-count">' + list.length + '件</span>' + '</' + hSub + '>' +
          list.map(function (e) { return cardHTML(e, selected, { past: selected < today, hName: hName }); }).join('');
      }
      renderTail();
    }

    function renderDeadlines() {
      // 締切が今日以降・3週間以内のものだけ。無ければ何も出さない。
      // 会員ページは先の予定まで持っているので、締切も先まで出す（特典に
      // 「先のぶんまで残り日数つき」と書いてある。21日で切ると書いてあることと合わない）。
      var horizon = opts.teaser ? 21 : Infinity;
      var soon = events
        .filter(function (e) { return e.deadline && e.deadline.date >= today; })
        .filter(function (e) { return (parseISO(e.deadline.date) - parseISO(today)) / MS_DAY <= horizon; })
        .sort(function (a, b) { return a.deadline.date.localeCompare(b.deadline.date); });
      if (!soon.length) { $dlTop.hidden = true; $dl.hidden = true; return; }
      function rowsFor(list, compact) {
        return list.map(function (e) { return rowHtml(e, compact); }).join('');
      }
      function rowHtml(e, compact) {
          var days = Math.round((parseISO(e.deadline.date) - parseISO(today)) / MS_DAY);
          var how = [];
          if (e.when) how.push('開催 ' + e.when);
          // 上の「今日・まもなく」枠では、締切の日付は左のバッジに出ているので繰り返さない
          // （繰り返すと枠が3画面ぶんに膨らみ、肝心のカレンダーが画面外に出る）。
          if (e.deadline.raw && !compact) how.push('申込 ' + e.deadline.raw);
          // 電話番号は、押してかけられる形にする。素のテキストだと、締切当日に
          // 長押しでコピーしてから電話帳に貼るしかない（申込むための唯一の手段なのに）。
          var tel = '';
          if (e.contact && e.contact.tel) {
            tel = '<a class="bvc-dltel" href="tel:' + esc(e.contact.tel.replace(/[^0-9+]/g, '')) + '">' +
              '☎ ' + esc((e.contact.who ? e.contact.who + ' ' : '') + e.contact.tel) + '</a>';
          }
          return '<div class="bvc-dlrow' + (compact ? ' is-compact' : '') + '"><span class="bvc-dldate">' + esc(fmtDay(e.deadline.date)) +
            (days === 0 ? '<b>今日</b>' : '<b>あと' + days + '日</b>') + '</span>' +
            '<span class="bvc-dlname">' + esc(e.name) +
            (how.length ? '<span class="bvc-dlhow">' + esc(how.join('／')) + '</span>' : '') +
            (tel ? '<span class="bvc-dlact">' + tel + '</span>' : '') +
            (safeURL(e.url)
              ? ' <a class="bvc-dllink" href="' + esc(safeURL(e.url)) + '" target="_blank" rel="noopener">くわしく</a>'
              : '') +
            '</span></div>';
      }
      // 締切の枠は4画面ぶん下にあり、当日締切に気づけなかった。上には「1行の知らせ」だけを
      // 置いて、押すと詳しい枠へ飛ばす。枠そのものを上に持ってくると、こんどはカレンダーの
      // 表が画面外に出た（248px 使っていた）ので、知らせと中身を分ける。
      var urgent = soon.filter(function (e) {
        return (parseISO(e.deadline.date) - parseISO(today)) / MS_DAY <= 3;
      });
      if (urgent.length) {
        var names = urgent.map(function (e) { return e.name; }).join('・');
        var todayOnly = urgent.filter(function (e) { return e.deadline.date === today; }).length;
        $dlTop.hidden = false;
        $dlTop.innerHTML =
          '<button class="bvc-dlalert" type="button" data-jump="deadlines">' +
          '<span class="bvc-dlalert-t">⏳ ' + (todayOnly ? '今日が申込の締切' : '数日で申込の締切') +
          '：' + esc(names) + '</span>' +
          '<span class="bvc-dlalert-go">申込先を見る →</span></button>';
      } else {
        $dlTop.hidden = true;
        $dlTop.innerHTML = '';
      }
      $dl.hidden = false;
      $dl.innerHTML = '<' + hSub + ' class="bvc-dlhead">⏳ 申込の締切が近いもの' + '</' + hSub + '>' + rowsFor(soon);
    }

    function renderTail() {
      var html = '';
      // 会期もの（「〜10/14まで」のように、日付ではなく期間で開いているもの）
      var spans = events.filter(function (e) { return e.span && (!e.span.to || e.span.to >= today); });
      if (spans.length) {
        html += '<' + hSub + ' class="bvc-tailhead">📖 会期中ずっと見られるもの' + '</' + hSub + '>' +
          spans.map(function (e) {
            var label = e.span.to ? esc(fmtDay(e.span.to)) + 'まで' : '会期中';
            return '<article class="bvc-card"><p class="bvc-when">' + label + '</p>' +
              '<' + hName + ' class="bvc-name">' + esc(e.name) + '</' + hName + '>' +
              (e.place ? '<p class="bvc-place">' + esc(e.place) + '</p>' : '') +
              (e.summary ? '<p class="bvc-desc">' + esc(e.summary) + '</p>' : '') +
              (e.kidsNote && e.kidsNote !== e.summary ? '<p class="bvc-kids">' + esc(e.kidsNote) + '</p>' : '') +
              (e.hours ? '<p class="bvc-hours">🕘 ' + esc(e.hours) + '</p>' : '') +
              (e.caution ? '<p class="bvc-caution">⚠️ ' + esc(e.caution) + '</p>' : '') +
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
        html += '<' + hSub + ' class="bvc-tailhead">🔎 日程がまだ確定していないもの' + '</' + hSub + '>' +
          '<p class="bvc-tailnote">例年の時期から拾ったものです。日付はカレンダーのマス目には入れていません。公式で確認してからお出かけください。</p>' +
          tent.map(function (e) {
            return '<div class="bvc-tentrow"><span class="bvc-tentwhen">' + esc(e.when || '') + '</span>' +
              '<span class="bvc-tentname">' + esc(e.name) + '</span>' +
              // ★素の <a> だと 17x56px で、同じページのほかの公式リンク（44px以上）より
              //   ずっと押しにくかった。同じボタンの形に揃える。
              (safeURL(e.url)
                ? ' <a class="bvc-btn bvc-btn-sub" href="' + esc(safeURL(e.url)) +
                  '" target="_blank" rel="noopener">🔗 公式</a>'
                : '') + '</div>';
          }).join('');
      }
      // いつでも行ける定番（プール・水遊び・常設）
      if ((data.standing || []).length) {
        html += '<' + hSub + ' class="bvc-tailhead">🌊 いつでも行ける定番' + '</' + hSub + '>' +
          data.standing.map(function (s) {
            return '<article class="bvc-card"><p class="bvc-when">' + esc(s.span) + '</p>' +
              '<' + hName + ' class="bvc-name">' + esc(s.name) + '</' + hName + '>' +
              (s.place ? '<p class="bvc-place">' + esc(s.place) + '</p>' : '') +
              (s.summary ? '<p class="bvc-desc">' + esc(s.summary) + '</p>' : '') +
              (s.kidsNote && s.kidsNote !== s.summary ? '<p class="bvc-kids">' + esc(s.kidsNote) + '</p>' : '') +
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
        if (cell.classList.contains('tap')) { e.preventDefault(); cell.click(); }
        return;
      }
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
      if (!step) return;
      e.preventDefault();
      var cells = [].slice.call(root.querySelectorAll('.bvc-cell'));
      var i = cells.indexOf(cell);
      // 予定のある（=フォーカスできる）マスまで進む
      for (var j = i + step; j >= 0 && j < cells.length; j += step > 0 ? 1 : -1) {
        if (cells[j].classList.contains('tap')) { cells[j].focus(); return; }
      }
    });
  }

  global.BVCalendar = { mount: mount };
})(window);
