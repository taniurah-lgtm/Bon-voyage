/**
 * Grok の自動化の結果メールを、シート「AIのさがしもの」の「受け取り」に写す（1時間ごと）— Google Apps Script
 *
 * 2026-11-25 オーナー「Grok と Muse も（シートに）繋げたい」
 *   Grok を Google につながない（つなぐと Google ドライブ全体を読み書きできる形になりやすい）。
 *   そのかわり、Grok の自動化は結果をメールで送れるので、そのメールだけをこのスクリプトがシートへ写す。
 *   Claude は受信箱を見ない（CLAUDE.md）。読むのはシートだけ。
 *
 * 使い方（1回だけ・約3分）:
 *  1) Grok の結果メールが届く Google アカウントで https://script.google.com/ →「新しいプロジェクト」
 *  2) 既定のコードを全部消して、このファイルの中身を貼る
 *  3) 関数の選択で「setup」を選んで ▶ 実行 → 権限を許可
 *     （Gmail を読む・シートに書く。Google は Gmail 全体の権限として聞いてくるが、
 *       このスクリプトが開くのは、差出人が xAI のメールだけ）
 *     → いま届いている分を写し、そのあと1時間ごとに動く
 *  4) そのアカウントがシートの持ち主（個人アカウント）と違うときは、シートをそのアカウントに「編集者」で共有してから 3)
 *  止めるとき: 「stop」を ▶ 実行
 *
 * しくみ:
 *  - 差出人のアドレスが @x.ai か @grok.com のメールだけを読む（ほかのメールは開かない）
 *  - 本文に「【」（見つかった催しの印）があるものだけ写す。「きょうは見つかりませんでした」だけの日と、お知らせのメールは写さない
 *  - どこまで写したかを覚えておき、同じメールを二度写さない（同じ件名のメールは Gmail で1つのスレッドにまとまるため、ラベルではなく日時で覚える）
 *  - 写すのは A 日時・B どのAI・C 本文。D・E 列（Claudeの印・メモ）は空のまま
 */
var SHEET_ID = '1CpFa4YGPxYNqoBsJDWVCuwoHyy7IAdXzJWNK2xsBseU';
var TAB = '受け取り';
var SOURCES = [
  { key: 'grok', query: 'from:(x.ai OR grok.com)', from: /@(x\.ai|grok\.com)>?\s*$/i, label: 'Grok（X）' },
  // Muse が結果をメールで送れるようになったら、ここに1行足す
];

function copyAiMailToSheet() {
  var props = PropertiesService.getScriptProperties();
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  SOURCES.forEach(function (src) {
    var last = Number(props.getProperty('last_' + src.key) || 0);
    var newest = last;
    var rows = [];
    GmailApp.search(src.query + ' newer_than:7d', 0, 30).forEach(function (t) {
      t.getMessages().forEach(function (m) {
        var ts = m.getDate().getTime();
        if (ts <= last) return;                       // もう写した
        if (!src.from.test(m.getFrom())) return;       // 差出人を、もう一度確かめる
        if (ts > newest) newest = ts;
        var body = m.getPlainBody() || '';
        if (body.indexOf('【') < 0) return;           // 見つからなかった日・お知らせ
        rows.push([m.getDate(), src.label, body.slice(0, 45000), '', '']);
      });
    });
    rows.sort(function (a, b) { return a[0] - b[0]; });
    rows.forEach(function (r) { sh.appendRow(r); });
    props.setProperty('last_' + src.key, String(newest));
  });
}

function setup() {
  stop();
  ScriptApp.newTrigger('copyAiMailToSheet').timeBased().everyHours(1).create();
  copyAiMailToSheet();
}

function stop() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'copyAiMailToSheet') ScriptApp.deleteTrigger(tr);
  });
}
