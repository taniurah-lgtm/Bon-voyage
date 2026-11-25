/**
 * 「AIのさがしもの」フォーム（Grok・Muse・Gemini の答えを、貼って送るだけ）— Google Apps Script
 *
 * 2026-11-25 オーナー「Claude と Muse、Grok の API 連携はないですよね？ スプシを経由して自動化できないか」
 *   → Muse・Grok の答えをこのフォームに貼る → 答えはシートにたまる → Claude が号を作るときにシートを読む。
 *   仕組みの説明は docs/prompts/grok-daily.md「シートで受け渡す」。
 *
 * 使い方（1回だけ・約2分。create-forms.gs と同じ）:
 *  1) https://script.google.com/ を開く →「新しいプロジェクト」
 *  2) 既定のコードを全部消して、このファイルの中身を貼り付け
 *  3) 上の関数の選択で「createAiRelayForm」を選び ▶ 実行
 *  4) 初回は権限の確認 →「詳細」→「（安全ではないページ）に移動」→ 許可（自分のアカウントで作る自作スクリプト）
 *  5) 下の「実行ログ」に出る「回答URL」をスマホのホーム画面に置く（ブックマーク）
 *  6) 「シートのURL」を Claude に送る。
 *     個人アカウント以外（通信用アカウント）で作ったときは、シートを個人アカウントに「編集者」で共有する
 *     （Claude が読み、確かめた結果の印を右の列に付けるため）
 *
 * 🔒 回答URLは人に渡さない（URLを知っている人はだれでも書き込めてしまう）。
 * 🔒 このスクリプトはメールに触らない（Gmail の権限を求めない）。
 */
function createAiRelayForm() {
  var f = FormApp.create('AIのさがしもの（貼るだけ）');
  f.setDescription('Grok・Muse・Gemini の答えを、そのまま貼って送るだけ。自分用です（URLを人に渡さない）。');
  f.setCollectEmail(false);
  f.setShowLinkToRespondAgain(true);
  f.setConfirmationMessage('受け取りました。号を作るときに、公式のページで確かめてから載せます。');

  f.addMultipleChoiceItem()
    .setTitle('どのAIの答えですか')
    .setChoiceValues(['Grok（X）', 'Muse（Instagram・Threads）', 'Gemini', 'そのほか'])
    .setRequired(true);
  f.addParagraphTextItem()
    .setTitle('答え（長押しでコピーして、そのまま貼る）')
    .setRequired(true);

  var ss = SpreadsheetApp.create('AIのさがしもの');
  f.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  // 回答のシートの右に、Claude が付ける印の列を足す（起票した・見送った・スクショ待ち など）
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getFormUrl()) {
      sheets[i].getRange(1, 4).setValue('Claudeの印');
      sheets[i].setColumnWidth(3, 600);
      break;
    }
  }

  Logger.log('回答URL（スマホのホーム画面に置く）: ' + f.getPublishedUrl());
  Logger.log('編集URL: ' + f.getEditUrl());
  Logger.log('シートのURL（Claude に送る）: ' + ss.getUrl());
}
