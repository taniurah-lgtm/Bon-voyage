/* ぼんぼやーじゅ通信 — この地図に直接書く（投稿フォーム）
 *
 *   BVPost.mount(el, {
 *     endpoint,      // Google Apps Script のウェブアプリURL。空なら「送れない」案内に切り替わる
 *     spots,         // 場所の候補（入力補助）
 *     gate,          // { blobs, iter } 合言葉が正しいかの判定用（合言葉そのものは入っていない）
 *     joinUrl,       // 応援サポーターの案内先
 *     freeLimit,     // 無料の方の字数（既定 40）
 *     paidLimit      // サポーターの方の字数（既定 300）
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
  function b2u(b) { return Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); }); }

  async function verifyPass(pass, gate) {
    if (!gate || !gate.blobs || !gate.blobs.length) return false;
    pass = (pass || '').normalize('NFC');
    if (!pass) return false;
    for (var i = 0; i < gate.blobs.length; i++) {
      var blob = gate.blobs[i];
      try {
        var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
        var key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b2u(blob.salt), iterations: gate.iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
        var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b2u(blob.iv) }, key, b2u(blob.ct));
        if (new TextDecoder().decode(pt) === 'ok') return true;
      } catch (e) { /* 合言葉が違うだけ。次のブロブを試す */ }
    }
    return false;
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
    // 字数は誰でも同じ。サポーターとの差は写真だけ（2026-08-23 オーナー判断）
    var textLimit = opts.textLimit || opts.paidLimit || 300;
    var spots = opts.spots || [];
    var isSupporter = false;

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
      '<summary>写真も添えたい方（応援サポーターの合言葉）</summary>' +
      '<label class="bvp-lb" for="bvp-pass">合言葉</label>' +
      '<div class="bvp-passrow">' +
      '<input class="bvp-in" id="bvp-pass" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="合言葉">' +
      '<button class="bvp-btn bvp-btn-sub" type="button" data-act="verify">確認</button>' +
      '</div>' +
      '<p class="bvp-gate-msg" aria-live="polite"></p>' +
      '<div class="bvp-photo" hidden>' +
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
    var $gateMsg = el.querySelector('.bvp-gate-msg');
    var $photoBox = el.querySelector('.bvp-photo');
    var $file = el.querySelector('#bvp-file');
    var $preview = el.querySelector('.bvp-preview');
    var photoData = null;

    restoreDraft();
    autoVerify();

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

    // 会員ページを開いた人は sessionStorage に合言葉が入っている（同じオリジン）。
    // それで通るなら、ここで打ち直させる必要はない。
    async function autoVerify() {
      var saved;
      try { saved = sessionStorage.getItem('bv_pw'); } catch (e) { return; }
      if (!saved) return;
      if (!(await verifyPass(saved, opts.gate))) return;
      isSupporter = true;
      var gate = el.querySelector('.bvp-gate');
      if (gate) gate.open = true;
      $gateMsg.textContent = '応援ありがとうございます。写真も添えられます。';
      $gateMsg.className = 'bvp-gate-msg is-ok';
      $photoBox.hidden = false;
      $text.dispatchEvent(new Event('input'));
    }

    el.addEventListener('click', async function (e) {
      var v = e.target.closest('[data-act="verify"]');
      if (!v) return;
      var pass = el.querySelector('#bvp-pass').value.trim();
      $gateMsg.textContent = '確認しています…';
      isSupporter = await verifyPass(pass, opts.gate);
      if (isSupporter) {
        try { sessionStorage.setItem('bv_pw', pass.normalize('NFC')); } catch (e) { /* 覚えられなくても動く */ }
        $gateMsg.textContent = 'ありがとうございます。写真も添えられます。';
        $gateMsg.className = 'bvp-gate-msg is-ok';
        $photoBox.hidden = false;
      } else {
        $gateMsg.textContent = pass
          ? '合言葉が違うようです。空欄のままでも、ひとことは同じ長さで送れます（写真だけが添えられません）。'
          : '合言葉を入れてから「確認」を押してください。';
        $gateMsg.className = 'bvp-gate-msg is-ng';
        $photoBox.hidden = true;
        photoData = null;
        $preview.innerHTML = '';
      }
      $text.dispatchEvent(new Event('input'));
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
        tier: isSupporter ? 'サポーター' : '一般',
        photo: isSupporter ? photoData : null,
        page: location.pathname,
      };

      if (!opts.endpoint) return offline(payload, '送信先がまだ設定されていません。');

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
        offline(payload, '送信がうまくいきませんでした（' + err.message + '）。');
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
        '</span>';
      var b = $msg.querySelector('[data-copy]');
      if (b) b.addEventListener('click', function () {
        navigator.clipboard.writeText(asText).then(
          function () { b.textContent = 'コピーしました'; },
          function () { b.textContent = 'コピーできませんでした'; }
        );
      });
    }

    // 送れたあとに、はじめて応援のお願いを出す（書く前には出さない）
    function done(payload) {
      form.hidden = true;
      var d = el.querySelector('.bvp-done');
      d.hidden = false;
      d.innerHTML =
        '<h2 class="bvp-h">ありがとうございます。</h2>' +
        '<p class="bvp-lead">「' + esc(payload.spot) + '」への<b>' + esc(payload.text.slice(0, 24)) +
        (payload.text.length > 24 ? '…' : '') + '</b>をお預かりしました。' +
        '内容を確認したうえで、数日のうちに地図へ載せます。</p>' +
        (payload.tier === 'サポーター'
          ? '<p class="bvp-lead">写真もいっしょにお預かりしました。ありがとうございます。</p>'
          : '<div class="bvp-nudge">' +
            '<p>写真もいっしょに載せたいときは。</p>' +
            '<p class="bvp-nudge-body">応援サポーター（月300円）の方は、<b>その場の写真</b>も添えられます。' +
            'この通信を続けるのに、LINEの配信費が月5,000円かかっています。' +
            '20人の方に支えていただけると、そこが自前で回ります。</p>' +
            (opts.joinUrl ? '<a class="bvp-nudge-link" href="' + esc(opts.joinUrl) + '">サポーターについて見てみる →</a>' : '') +
            '</div>') +
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
