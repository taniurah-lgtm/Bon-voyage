/* ぼんぼやーじゅ通信 — この地図に直接書く（投稿フォーム）
 *
 *   BVPost.mount(el, {
 *     endpoint,      // Google Apps Script のウェブアプリURL。空なら「送れない」案内に切り替わる
 *     spots,         // 場所の候補（入力補助）
 *     freeLimit,     // 無料の方の字数（既定 40）
 *   })
 *
 * Googleフォームには飛ばさない。このページの中で書いて、そのまま送る。
 * 送り先は Apps Script のウェブアプリ。Content-Type を付けずに送るので
 * ブラウザの事前確認（preflight）が起きず、スプレッドシートに直接入る。
 *
 * 送れなかったときは、書いた文章を捨てない（下書きを端末に残し、コピーもできる）。
 */
(function (global) {
  'use strict';

  var DRAFT_KEY = 'bv_map_draft';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 写真は端末側で縮めてから送る（回線と受け側の負担を減らす）
  function shrink(file, maxPx, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('画像を読めませんでした')); };
      img.src = url;
    });
  }

  function mount(el, opts) {
    opts = opts || {};
    // 字数は誰でも同じ。合言葉の有無で変わるのは写真だけ
    var textLimit = opts.textLimit || opts.paidLimit || 300;
    var spots = opts.spots || [];
    // 送り先が無いのに「載せています」と書いて送信させると、押すまで送れないと分からない。
    // 押す前に、どこへ送ればよいかを言う。
    var canSend = !!opts.endpoint;
    var lineUrl = opts.lineUrl || 'https://lin.ee/YtcfjnX';
    if (!canSend) {
      el.innerHTML =
        '<div class="bvp">' +
        '<h2 class="bvp-h">あなたの「よかった」も置いていきませんか</h2>' +
        '<p class="bvp-lead">行ってよかった場所、こうすると楽だったこと。ひとことで構いません。' +
        '<b>いまはLINEでお預かりしています。</b>いただいた内容は、こちらで目を通してから地図に載せています（数日いただきます）。</p>' +
        '<p class="bvp-lead">場所の名前と、ひとことを送っていただければ十分です。' +
        'お子さんのお名前や顔がわかる写真、通っている園・学校がわかる内容は、掲載を控えさせていただきます。</p>' +
        '<div class="bvp-actions">' +
        '<a class="bvp-btn bvp-btn-go" href="' + esc(lineUrl) + '" target="_blank" rel="noopener">LINEで送る</a>' +
        '</div>' +
        '</div>';
      return;
    }

    el.innerHTML =
      '<form class="bvp" novalidate>' +
      '<h2 class="bvp-h">あなたの「よかった」も置いていきませんか</h2>' +
      '<p class="bvp-lead">行ってよかった場所、こうすると楽だったこと。ひとことで構いません。' +
      'いただいた内容は、こちらで目を通してから地図に載せています（数日いただきます）。</p>' +

      '<label class="bvp-lb" for="bvp-spot">場所の名前 <span class="bvp-req">必須</span></label>' +
      '<input class="bvp-in" id="bvp-spot" name="spot" list="bvp-spots" autocomplete="off" ' +
      'placeholder="例: 小金井公園" required>' +
      '<datalist id="bvp-spots">' +
      spots.map(function (s) { return '<option value="' + esc(s.name) + '"></option>'; }).join('') +
      '</datalist>' +
      '<p class="bvp-hint">地図にない場所でも大丈夫です。そのまま書いてください。</p>' +

      '<label class="bvp-lb" for="bvp-text">ひとこと <span class="bvp-req">必須</span></label>' +
      '<textarea class="bvp-in bvp-ta" id="bvp-text" name="text" rows="3" maxlength="' + textLimit + '" ' +
      'placeholder="日かげが多くて、2歳でも1時間あそべました" required></textarea>' +
      '<p class="bvp-count"><span class="bvp-n">0</span> / ' + textLimit + '字</p>' +

      '<label class="bvp-lb" for="bvp-who">お名前・ニックネーム</label>' +
      '<input class="bvp-in" id="bvp-who" name="who" autocomplete="off" placeholder="空欄なら「ご近所の方」と出ます">' +

      '<label class="bvp-lb" for="bvp-area">お住まいのエリア・お子さんの年齢</label>' +
      '<input class="bvp-in" id="bvp-area" name="area" autocomplete="off" placeholder="例: 小平・4歳2歳">' +
      '<p class="bvp-hint">市や町までで十分です。番地や園・学校の名前は書かないでください。</p>' +

      '<details class="bvp-gate">' +
      '<summary>写真も添える（任意）</summary>' +
      '<div class="bvp-photo">' +
      '<label class="bvp-lb" for="bvp-file">写真（1枚）</label>' +
      '<input class="bvp-in bvp-file" id="bvp-file" type="file" accept="image/*">' +
      '<p class="bvp-hint">お顔がうつっていないものをお願いします。送る前に小さく縮めてお送りします。</p>' +
      '<div class="bvp-preview"></div>' +
      '</div>' +
      '</details>' +

      '<label class="bvp-check"><input type="checkbox" id="bvp-ok" required> ' +
      '<span>掲載前に運営が内容を確認すること、掲載を見送る場合があることに同意します。</span></label>' +

      '<div class="bvp-actions">' +
      '<button class="bvp-btn bvp-btn-go" type="submit">この地図に書き込む</button>' +
      '</div>' +
      '<p class="bvp-msg" role="status" aria-live="polite"></p>' +

      '<p class="bvp-fine">お子さんのお名前や顔がわかる写真、通っている園・学校がわかる内容は、掲載を控えさせていただきます。' +
      'いただいた内容は地図の掲載にのみ使います。</p>' +
      '</form>' +
      '<div class="bvp-done" hidden></div>';

    var form = el.querySelector('.bvp');
    var $text = el.querySelector('#bvp-text');
    var $n = el.querySelector('.bvp-n');
    var $msg = el.querySelector('.bvp-msg');
    var $file = el.querySelector('#bvp-file');
    var $preview = el.querySelector('.bvp-preview');
    var photoData = null;

    restoreDraft();

    $text.addEventListener('input', function () {
      var n = $text.value.length;
      $n.textContent = n;
      // 残りが少なくなったときだけ色を変える。字数で応援のお願いはしない。
      el.querySelector('.bvp-count').classList.toggle('is-over', n > textLimit - 30);
      saveDraft();
    });
    ['bvp-spot', 'bvp-who', 'bvp-area'].forEach(function (id) {
      el.querySelector('#' + id).addEventListener('input', saveDraft);
    });

    if ($file) {
      $file.addEventListener('change', async function () {
        photoData = null;
        $preview.innerHTML = '';
        var f = $file.files && $file.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { $preview.textContent = '画像のファイルを選んでください。'; return; }
        $preview.textContent = '縮めています…';
        try {
          photoData = await shrink(f, 1280, 0.82);
          $preview.innerHTML = '<img src="' + photoData + '" alt="選んだ写真">' +
            '<span>約' + Math.round(photoData.length / 1400) + 'KBで送ります</span>';
        } catch (err) {
          $preview.textContent = '画像を読めませんでした。別のファイルでお試しください。';
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var spot = el.querySelector('#bvp-spot').value.trim();
      var text = $text.value.trim();
      var ok = el.querySelector('#bvp-ok').checked;
      if (!spot) return fail('場所の名前を入れてください。');
      if (!text) return fail('ひとことを入れてください。');
      if (!ok) return fail('掲載についての確認にチェックを入れてください。');

      var payload = {
        spot: spot,
        text: text,
        who: el.querySelector('#bvp-who').value.trim(),
        area: el.querySelector('#bvp-area').value.trim(),
        photo: photoData,
        page: location.pathname,
      };

      // 送り先が未設定のときは、読者に運用の事情を説明しない。
      // 「いまはLINEでお預かりしています」という事実だけ伝える。
      if (!opts.endpoint) return offline(payload, 'いまこのフォームからは送れません。');

      var btn = el.querySelector('.bvp-btn-go');
      btn.disabled = true;
      $msg.className = 'bvp-msg';
      $msg.textContent = '送っています…';
      try {
        // Content-Type を付けない＝ブラウザが text/plain で送るので preflight が起きない
        var res = await fetch(opts.endpoint, { method: 'POST', body: JSON.stringify(payload) });
        var body = await res.json().catch(function () { return null; });
        if (!res.ok || !body || body.ok !== true) throw new Error((body && body.error) || ('HTTP ' + res.status));
        // ★下書きの掃除で失敗しても、送信は成功している。ここで throw させて
        //   「送れませんでした」に落とすと、利用者が二重に送ってしまう。
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 消せなくても害はない */ }
        done(payload);
      } catch (err) {
        btn.disabled = false;
        // err.message（Failed to fetch / HTTP 502 など）は読者には意味がないので出さない
        if (window.console) console.warn('[bv-post]', err);
        offline(payload, '送信がうまくいきませんでした。');
      }
    });

    function fail(m) {
      $msg.className = 'bvp-msg is-ng';
      $msg.textContent = m;
    }

    // 送れなかったときに、書いた文章を捨てない
    function offline(payload, why) {
      var asText =
        '【おでかけマップへの投稿】\n場所: ' + payload.spot + '\nひとこと: ' + payload.text +
        (payload.who ? '\nお名前: ' + payload.who : '') +
        (payload.area ? '\nエリア・年齢: ' + payload.area : '');
      $msg.className = 'bvp-msg is-ng';
      $msg.innerHTML =
        esc(why) + '<br>' +
        (draftWorks
          ? '書いていただいた内容はこの端末に残してあります。'
          : '<b>この画面を離れると消えてしまいます。先にコピーをお願いします。</b>') +
        'お手数ですが、下のボタンでコピーして、LINEでそのまま送っていただけると確実です。' +
        '<span class="bvp-offline">' +
        '<button class="bvp-btn bvp-btn-sub" type="button" data-copy>コピーする</button>' +
        '<a class="bvp-btn bvp-btn-sub" href="https://lin.ee/YtcfjnX" target="_blank" rel="noopener">LINEを開く</a>' +
        '</span>';
      var b = $msg.querySelector('[data-copy]');
      if (b) b.addEventListener('click', function () {
        navigator.clipboard.writeText(asText).then(
          function () { b.textContent = 'コピーしました'; },
          function () { b.textContent = 'コピーできませんでした'; }
        );
      });
    }

    function done(payload) {
      form.hidden = true;
      var d = el.querySelector('.bvp-done');
      d.hidden = false;
      d.innerHTML =
        '<h2 class="bvp-h">ありがとうございます。</h2>' +
        '<p class="bvp-lead">「' + esc(payload.spot) + '」への<b>' + esc(payload.text.slice(0, 24)) +
        (payload.text.length > 24 ? '…' : '') + '</b>をお預かりしました。' +
        '内容を確認したうえで、数日のうちに地図へ載せます。</p>' +
        (payload.photo
          ? '<p class="bvp-lead">写真もいっしょにお預かりしました。ありがとうございます。</p>'
          : '') +
        '<p class="bvp-actions"><button class="bvp-btn bvp-btn-sub" type="button" onclick="location.reload()">もう1件書く</button></p>';
      d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    var draftWorks = true;   // 下書きが本当に端末に残るか（プライベートブラウズでは残らない）
    function saveDraft() {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          spot: el.querySelector('#bvp-spot').value,
          text: $text.value,
          who: el.querySelector('#bvp-who').value,
          area: el.querySelector('#bvp-area').value,
        }));
        draftWorks = true;
      } catch (e) {
        draftWorks = false;   // プライベートブラウズなど。残らないので、そう言う
      }
    }
    function restoreDraft() {
      try {
        var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (!d) return;
        if (d.spot) el.querySelector('#bvp-spot').value = d.spot;
        if (d.text) $text.value = d.text;
        if (d.who) el.querySelector('#bvp-who').value = d.who;
        if (d.area) el.querySelector('#bvp-area').value = d.area;
        $text.dispatchEvent(new Event('input'));
      } catch (e) { /* 壊れた下書きは無視する */ }
    }
  }

  global.BVPost = { mount: mount };
})(window);
