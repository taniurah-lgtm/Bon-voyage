/**
 * ぼんぼやーじゅ通信 アンケート自動生成スクリプト（Google Apps Script）
 *
 * 使い方（1回だけ・約2分）:
 *  1) https://script.google.com/ を開く →「新しいプロジェクト」
 *  2) 既定のコードを全部消して、このファイルの中身を貼り付け
 *  3) 上部の関数選択で「createBonvoyaSurveys」を選び ▶ 実行
 *  4) 初回は権限の確認 →「詳細」→「（安全ではないページ）に移動」→ 許可
 *     （自分のアカウントで作る自作スクリプトなので問題ありません）
 *  5) 実行後、3つのフォームの「回答URL/編集URL」が自分宛メールに届きます
 *     （Googleドライブにもフォームと回答用スプレッドシートができています）
 *
 * 作られるもの: A 無料会員 / B 有料会員 / C 入会時 の3フォーム＋各回答シート
 */
function createBonvoyaSurveys() {
  var out = [];

  // ===== A. 無料会員アンケート =====
  var a = FormApp.create('ぼんぼやーじゅ通信 アンケート（A・みなさま向け）');
  a.setDescription('よりお役に立つための、かんたんなアンケートです（5分・任意・匿名でOK）。今後の内容づくりに生かします。');
  a.setCollectEmail(false);
  a.addCheckboxItem().setTitle('お子さんの年齢層（あてはまるものすべて）')
    .setChoiceValues(['0〜2歳', '3〜6歳（未就学）', '小学生', 'その他']);
  a.addMultipleChoiceItem().setTitle('お住まいエリア')
    .setChoiceValues(['小平', '西東京', '東久留米', '東村山', '小金井']).showOtherOption(true);
  a.addCheckboxItem().setTitle('主な移動手段（複数可）')
    .setChoiceValues(['徒歩・自転車', '電車', '車']);
  a.addMultipleChoiceItem().setTitle('通信は役に立っていますか')
    .setChoiceValues(['とても', 'まあ', 'ふつう', 'あまり']);
  a.addParagraphTextItem().setTitle('特に良かった回・スポットがあれば（任意）');
  a.addCheckboxItem().setTitle('もっと欲しい情報（複数可）')
    .setChoiceValues(['お祭り', '花火', '水あそび・プール', '屋内・雨の日', '公園', '動物', '電車でおでかけ', 'キャンプ', '連休の旅行', '味覚狩り', '映画・子連れ上映', '習い事・イベント']).showOtherOption(true);
  a.addCheckboxItem().setTitle('おでかけで一番困ること（複数可）')
    .setChoiceValues(['行き先を決められない', '混雑・待ち時間', '雨の日の行き先', '予約の取り方・タイミング', '費用', '移動・アクセス']).showOtherOption(true);
  a.addCheckboxItem().setTitle('あったら使いたい機能（複数可）')
    .setChoiceValues(['気になった予定をカレンダー登録', '家族に合わせた出し分け', '人気予約の開始日アラート', 'みんなの投稿マップ', '過去号アーカイブ']).showOtherOption(true);
  a.addMultipleChoiceItem().setTitle('こうした“もっと便利な機能”に、月いくらまでなら払ってもいい？')
    .setChoiceValues(['0円（無料だけがいい）', '100円', '300円', '500円', '1000円', 'それ以上']);
  a.addParagraphTextItem().setTitle('自由記述（要望・応援）');
  a.addTextItem().setTitle('続報や個別のご案内を受け取りたい方は、ニックネームや連絡手段をどうぞ（任意）');
  var aSs = SpreadsheetApp.create('回答_A_無料会員アンケート');
  a.setDestination(FormApp.DestinationType.SPREADSHEET, aSs.getId());
  out.push('【A 無料会員】\n  回答URL: ' + a.getPublishedUrl() + '\n  編集URL: ' + a.getEditUrl());

  // ===== B. 有料会員アンケート =====
  var b = FormApp.create('ぼんぼやーじゅ通信 アンケート（B・応援会員向け）');
  b.setDescription('会員のみなさま向けのアンケートです（5分・任意）。次に強化することの参考にします。');
  b.setCollectEmail(false);
  b.addScaleItem().setTitle('満足度').setBounds(1, 5).setLabels('低い', '高い');
  b.addCheckboxItem().setTitle('特に役立っている特典（複数可）')
    .setChoiceValues(['週2配信', 'カレンダー登録（📅）', '家族に合わせた出し分け', '会員ページのカレンダー']).showOtherOption(true);
  b.addCheckboxItem().setTitle('もっと強化してほしい（上位3つまで）')
    .setChoiceValues(['予約開始アラート', 'みんなの投稿マップ', '出し分けの精度', '対象エリア拡大', '過去号の充実']).showOtherOption(true);
  b.addParagraphTextItem().setTitle('「追跡してほしい予約・チケット」があれば（自由記述）');
  b.addParagraphTextItem().setTitle('続けたい理由 / もしやめるとしたら理由');
  b.addParagraphTextItem().setTitle('自由記述');
  var bSs = SpreadsheetApp.create('回答_B_有料会員アンケート');
  b.setDestination(FormApp.DestinationType.SPREADSHEET, bSs.getId());
  out.push('【B 有料会員】\n  回答URL: ' + b.getPublishedUrl() + '\n  編集URL: ' + b.getEditUrl());

  // ===== C. 入会時アンケート（カスタマイズ） =====
  var c = FormApp.create('ぼんぼやーじゅ通信 カスタマイズ設問（C・ご入会時）');
  c.setDescription('よりあなたのご家庭に合わせるための設問です（任意・5分）。');
  c.setCollectEmail(false);
  c.addTextItem().setTitle('ニックネーム');
  c.addTextItem().setTitle('最寄駅（例: 花小金井）');
  c.addTextItem().setTitle('お住まいの市区町村（例: 小平市）');
  c.addCheckboxItem().setTitle('主な移動手段（複数可）').setChoiceValues(['徒歩', '自転車', '電車', '車']);
  c.addMultipleChoiceItem().setTitle('どこまでの範囲の情報がほしい？')
    .setChoiceValues(['近所（徒歩・自転車圏）', '市内', '多摩地域全体', '多摩＋都心も', '車での遠出（キャンプ等）も']);
  c.addCheckboxItem().setTitle('興味のあるジャンル（複数可）')
    .setChoiceValues(['夏祭り・盆踊り', '花火', 'プール・水あそび', 'キャンプ・アウトドア', '動物園・水族館・牧場', '屋内あそび場', '味覚狩り・農業体験', '紅葉・自然', 'イルミネーション', '博物館・科学館', '地域のお祭り・マルシェ', 'スポーツ観戦']);
  c.addTextItem().setTitle('お子さんの年齢（例: 6歳・4歳・2歳）');
  c.addMultipleChoiceItem().setTitle('ベビーカー利用や、オムツ替え/水遊びパンツの配慮が必要ですか？').setChoiceValues(['はい', 'いいえ']);
  c.addMultipleChoiceItem().setTitle('平日のおでかけは可能？').setChoiceValues(['土日のみ', '平日も都合をつけられる']);
  c.addMultipleChoiceItem().setTitle('予算感').setChoiceValues(['無料・格安中心がいい', '有料イベントもOK']);
  c.addMultipleChoiceItem().setTitle('受け取り頻度').setChoiceValues(['週2回（水・土）', '週1回']);
  c.addParagraphTextItem().setTitle('その他ご要望（自由記述）');
  var cSs = SpreadsheetApp.create('回答_C_入会時カスタマイズ');
  c.setDestination(FormApp.DestinationType.SPREADSHEET, cSs.getId());
  out.push('【C 入会時】\n  回答URL: ' + c.getPublishedUrl() + '\n  編集URL: ' + c.getEditUrl());

  // URL を自分宛メールで受け取る（不要ならこの2行を消してOK）
  var msg = out.join('\n\n');
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'ぼんぼやーじゅ通信 アンケート3つ 作成完了', msg);

  Logger.log(msg); // 実行ログ（表示 > ログ）でも確認できます
}
