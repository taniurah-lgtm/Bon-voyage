/**
 * みんなのおでかけマップ — サイト内フォームからの投稿を受ける Google Apps Script。
 *
 * ホームページの投稿フォーム（/assets/bv-post.js）が、ここに JSON を POST する。
 * Googleフォームには飛ばさないので、書く人はページから離れない。
 *
 * ────────────────────────────────────────────────────────────
 * 置き方（初回だけ・10分ほど）
 *
 *  1. https://script.google.com/ →「新しいプロジェクト」
 *  2. このファイルの中身をぜんぶ貼り付ける
 *  3. 関数 setup を選んで「実行」。初回は認可画面が出るので許可する
 *     → 実行ログにスプレッドシートのURLが出る。承認はこのシートで行う
 *  4. 右上「デプロイ」→「新しいデプロイ」→ 種類の選択で「ウェブアプリ」
 *       次のユーザーとして実行: 自分
 *       アクセスできるユーザー: 全員          ← ここが「全員」でないと投稿が届かない
 *  5. 出てくる「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）を控える
 *  6. GitHub の リポジトリ設定 → Variables に MAP_POST_URL として登録する
 *     （Secrets ではなく Variables。URLは公開ページのJSに載るので秘密ではない）
 *
 * ★コードを直したら、必ず「デプロイの管理」→ 鉛筆 →「新しいバージョン」で
 *   デプロイし直す。保存しただけでは公開中のURLの中身は変わらない。
 *
 * ────────────────────────────────────────────────────────────
 * 気をつけること
 *
 *  - このURLを知っていれば誰でも投稿できる（フォームと同じ）。
 *    なので **承認されるまで公開しない** 仕組みは変えない。承認列に ✓ が入った行だけが
 *    公開用シートに出て、そこから地図に載る。
 *  - 合言葉はここには渡さない。サイト側で判定した結果（一般／サポーター）だけが届く。
 *    → シートに合言葉が残らない（従来のフォーム運用で残っていた問題が消える）。
 *  - 短時間に同じ内容が続けて来たら弾く（二重送信と、いたずらの足止め）。
 */

var SHEET_NAME = '投稿';
var PHOTO_FOLDER = 'ぼんぼやーじゅ通信 — 投稿写真';
var PROP_SS = 'BV_MAP_SS_ID';
var PROP_FOLDER = 'BV_MAP_FOLDER_ID';

var HEADERS = [
  '受付日時', '場所', 'ひとこと', 'お名前', 'エリア・年齢', '区分', '写真', '文字数', '送信元', '承認',
];

/** 初回に1度だけ実行する。シートと写真の置き場を用意する。 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  var ss;
  var id = props.getProperty(PROP_SS);
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('ぼんぼやーじゅ通信 — おでかけマップ投稿');
    props.setProperty(PROP_SS, ss.getId());
  }

  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 180);   // 場所
  sh.setColumnWidth(3, 420);   // ひとこと
  // 承認列をチェックボックスにする
  var okCol = HEADERS.indexOf('承認') + 1;
  sh.getRange(2, okCol, 2000, 1).insertCheckboxes();

  // 既定の「シート1」が空で残っていたら消す
  var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  buildPublicSheet(ss);

  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER);
  props.setProperty(PROP_FOLDER, folder.getId());

  Logger.log('スプレッドシート: ' + ss.getUrl());
  Logger.log('写真の置き場: ' + folder.getUrl());
  Logger.log('次は「デプロイ」→「ウェブアプリ」→ アクセスできるユーザー=全員 でデプロイする');
}

/** 承認済みの行だけを、写真URLを伏せて並べるシート。ここだけをCSVでウェブに公開する。 */
function buildPublicSheet(ss) {
  var pub = ss.getSheetByName('公開用') || ss.insertSheet('公開用');
  pub.clear();
  pub.getRange(1, 1, 1, 6)
    .setValues([['受付日時', '場所', 'ひとこと', 'お名前', 'エリア・年齢', '区分']])
    .setFontWeight('bold');
  // 承認列(J)が TRUE の行だけを、A〜F の順で出す
  pub.getRange('A2').setFormula(
    "=IFERROR(QUERY('" + SHEET_NAME + "'!A2:J, \"select A,B,C,D,E,F where J = TRUE\", 0), \"\")"
  );
  pub.setColumnWidth(2, 180);
  pub.setColumnWidth(3, 420);
}

/** ブラウザで開いたときの応答（動作確認用）。投稿は受け付けない。 */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'bonvoyage-map-post' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** サイトの投稿フォームからの受け口。 */
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) return json({ ok: false, error: '中身がありません' });
    if (raw.length > 3 * 1024 * 1024) return json({ ok: false, error: '大きすぎます' });

    var d = JSON.parse(raw);
    var spot = trim(d.spot, 120);
    var text = trim(d.text, 1000);
    if (!spot || !text) return json({ ok: false, error: '場所とひとことは必須です' });

    // 二重送信・連投の足止め（同じ内容が5分以内に来たら受けない）
    var cache = CacheService.getScriptCache();
    var key = 'bv:' + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, spot + '|' + text)
    );
    if (cache.get(key)) return json({ ok: true, duplicate: true });
    cache.put(key, '1', 300);

    var props = PropertiesService.getScriptProperties();
    var ssId = props.getProperty(PROP_SS);
    if (!ssId) return json({ ok: false, error: 'setup がまだ実行されていません' });
    var sh = SpreadsheetApp.openById(ssId).getSheetByName(SHEET_NAME);

    // 写真はサポーターの投稿のときだけ保存する
    var photoUrl = '';
    if (d.tier === 'サポーター' && typeof d.photo === 'string' && d.photo.indexOf('data:image/') === 0) {
      photoUrl = savePhoto(d.photo, spot, props.getProperty(PROP_FOLDER));
    }

    sh.appendRow([
      new Date(),
      spot,
      text,
      trim(d.who, 60),
      trim(d.area, 60),
      d.tier === 'サポーター' ? 'サポーター' : '一般',
      photoUrl,
      text.length,
      trim(d.page, 120),
      false,
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function savePhoto(dataUrl, spot, folderId) {
  if (!folderId) return '';
  var m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return '';
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 3 * 1024 * 1024) return '';
  var name = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') + '_' +
    spot.replace(/[\\/:*?"<>|]/g, '') + '.jpg';
  var file = DriveApp.getFolderById(folderId)
    .createFile(Utilities.newBlob(bytes, m[1], name));
  return file.getUrl();
}

function trim(v, n) {
  var s = String(v == null ? '' : v).trim().slice(0, n);
  // ★数式として評価されないようにする。
  // Google Sheets はセルの中身が = + - @ タブ 改行 で始まると数式として実行するので、
  // 投稿に =IMPORTXML(...) と書かれるとオーナーのシートから外部へ通信してしまう。
  // 先頭にアポストロフィを付けると、文字列として扱われる（表示上は見えない）。
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
