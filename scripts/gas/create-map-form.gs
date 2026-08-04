/**
 * みんなのおでかけマップ 投稿フォームを一括生成する Google Apps Script。
 *
 * 使い方:
 *   1. https://script.google.com/ で「新しいプロジェクト」を作る
 *   2. このファイルの中身をぜんぶ貼り付ける
 *   3. 下の MEMBER_PASS に会員ページの合言葉を入れる（★このファイルには保存しないこと）
 *   4. 関数 createMapForm を選んで「実行」。初回は Google の認可画面が出るので許可する
 *   5. 実行ログに出る URL を控える（フォームURL / スプレッドシートURL）
 *
 * 作られるもの:
 *   - 投稿フォーム（設問・説明文・確認事項つき）
 *   - 回答スプレッドシート（フォームに紐づけ済み）
 *   - 回答シートの右端に「承認」チェックボックス列
 *   - 「公開用」シート … 承認済みの行だけを、合言葉を伏せたうえで並べる
 *     （ここだけを CSV でウェブに公開して、GitHub Actions から読む）
 */

// ★ここに会員ページの合言葉を入れる。リポジトリにはコミットしないこと。
const MEMBER_PASS = '';

const FORM_TITLE = 'みんなのおでかけマップに書き込む';
const SS_TITLE = 'ぼんぼやーじゅ通信 — おでかけマップ投稿';

function createMapForm() {
  if (!MEMBER_PASS) {
    throw new Error('MEMBER_PASS が空です。会員ページの合言葉を入れてから実行してください。');
  }

  // ---- フォーム本体 ----
  const form = FormApp.create(FORM_TITLE);
  form.setDescription(
    '花小金井まわりで「行ってよかった」場所を教えてください。ひとことで構いません。\n' +
    'いただいた内容は、こちらで目を通してから地図に掲載します（数日いただきます）。\n\n' +
    '※お子さんのお名前、顔がわかる写真、通っている園や学校がわかる内容は掲載できません。'
  );
  form.setCollectEmail(false);          // メールアドレスは集めない（匿名で書ける）
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setConfirmationMessage(
    'ありがとうございます。内容を確認のうえ、数日以内に地図へ掲載します。\n' +
    'マップ: https://bonvoya.nicomaru.tokyo/map.html'
  );

  form.addTextItem()
    .setTitle('場所の名前')
    .setHelpText('例: 小金井公園 / 多摩六都科学館 / 西東京いこいの森公園')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('ひとこと')
    .setHelpText(
      '行ってよかったこと、こうすると楽だったことなど。40字まででお願いします。\n' +
      '応援サポーターの方は、もう少し長めに書いていただけます（下の「合言葉」欄にご記入ください）。'
    )
    .setRequired(true);

  form.addTextItem()
    .setTitle('お名前・ニックネーム（地図に出ます）')
    .setHelpText('空欄でも構いません。その場合は「ご近所の方」と表示します。');

  form.addTextItem()
    .setTitle('お住まいのエリア・お子さんの年齢')
    .setHelpText('例: 小平・4歳2歳。市区町村より細かい住所は書かないでください。');

  form.addTextItem()
    .setTitle('合言葉（応援サポーターの方のみ）')
    .setHelpText('会員ページの合言葉です。ご記入いただくと、長めの文章も掲載できます。');

  // 写真: ファイルアップロードは環境によって使えないことがあるので、失敗しても止めない
  try {
    form.addFileUploadItem()
      .setTitle('写真（応援サポーターの方のみ・任意）')
      .setHelpText('お子さんの顔が写っていないものをお願いします。');
  } catch (e) {
    form.addSectionHeaderItem()
      .setTitle('写真を送りたい方へ')
      .setHelpText('このフォームでは写真を受け取れないため、nico25akmr@outlook.jp までお送りください。');
    Logger.log('ファイルアップロード設問は作成できませんでした（' + e.message + '）。メール案内に切り替えました。');
  }

  form.addCheckboxItem()
    .setTitle('掲載についての確認')
    .setChoiceValues(['掲載前に運営が内容を確認すること、掲載を見送る場合があることに同意します'])
    .setRequired(true);

  // ---- 回答スプレッドシート ----
  const ss = SpreadsheetApp.create(SS_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  // 紐づけ直後はシート名が確定していないことがあるので、開き直して探す
  const ss2 = SpreadsheetApp.openById(ss.getId());
  const res = ss2.getSheets().filter(function (s) { return !!s.getFormUrl(); })[0] || ss2.getSheets()[0];
  const resName = res.getName();

  // ---- 承認列（チェックボックス） ----
  const lastCol = Math.max(res.getLastColumn(), 1);
  const okCol = lastCol + 1;
  res.getRange(1, okCol).setValue('承認').setFontWeight('bold');
  res.getRange(2, okCol, 2000, 1).insertCheckboxes();
  res.setFrozenRows(1);

  // ---- 公開用シート ----
  // 列: A=タイムスタンプ B=場所 C=ひとこと D=ニックネーム E=エリア年齢 F=合言葉 …
  // 合言葉そのものは公開せず、一致したかどうかだけを「サポーター/一般」として出す。
  const col = function (n) {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; }
    return s;
  };
  const q = "'" + resName.replace(/'/g, "''") + "'!";
  const formula =
    '=ARRAYFORMULA(QUERY({' +
      q + 'A2:A,' +                                   // タイムスタンプ
      q + 'B2:B,' +                                   // 場所
      q + 'C2:C,' +                                   // ひとこと
      q + 'D2:D,' +                                   // ニックネーム
      q + 'E2:E,' +                                   // エリア・年齢
      'IF(EXACT(' + q + 'F2:F,"' + MEMBER_PASS + '"),"サポーター","一般"),' +  // 合言葉は伏せて判定結果だけ
      q + col(okCol) + '2:' + col(okCol) +            // 承認
    '},"select Col1,Col2,Col3,Col4,Col5,Col6 where Col7 = TRUE",0))';

  const pub = ss2.insertSheet('公開用');
  pub.getRange('A1:F1')
    .setValues([['タイムスタンプ', '場所', 'ひとこと', 'ニックネーム', 'エリア・年齢', '区分']])
    .setFontWeight('bold');
  pub.getRange('A2').setFormula(formula);
  pub.setFrozenRows(1);

  // ---- 結果 ----
  Logger.log('=== できました ===');
  Logger.log('フォーム（配布用URL）: ' + form.getPublishedUrl());
  Logger.log('フォーム（編集用URL）: ' + form.getEditUrl());
  Logger.log('スプレッドシート: ' + ss2.getUrl());
  Logger.log('回答シート名: ' + resName + ' / 承認列: ' + col(okCol));
  Logger.log('');
  Logger.log('次にやること:');
  Logger.log(' 1. スプレッドシートで「公開用」シートを開く');
  Logger.log(' 2. ファイル → 共有 → ウェブに公開 → 「公開用」＋「カンマ区切り(.csv)」で公開');
  Logger.log(' 3. 出てきたCSVのURLを GitHub Secrets に MAP_SHEET_CSV として登録');
  Logger.log(' 4. 上の配布用URLを GitHub Variables に MAP_FORM_URL として登録');
  Logger.log(' ※ 回答シートには合言葉が平文で残ります。このスプレッドシートは共有しないでください。');
}
