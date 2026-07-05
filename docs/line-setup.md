# LINE連携のセットアップ手順(初回のみ・所要15分)

イベントレポートを家族のLINEに届けるために、無料のLINE公式アカウント(Messaging API)を1つ作り、アクセストークンをClaude Codeの環境変数に登録します。

## 1. LINE公式アカウント(Messaging APIチャネル)を作る

1. https://developers.line.biz/ja/ を開き、普段のLINEアカウントでログイン。
2. 「プロバイダー」を新規作成(名前は例: `家族イベント`)。
3. プロバイダー内で「新規チャネル作成」→「Messaging API」を選択。
   - ※2024年以降は先に https://entry.line.biz/ でLINE公式アカウントを作成し、
     LINE Official Account Manager(https://manager.line.biz/)の
     「設定 → Messaging API」から有効化する導線の場合があります。画面の案内に従ってください。
   - チャネル名: 例 `ぼんぼやーじゅ通信`(家族に表示される名前)
   - 業種: 個人 / その他 でOK
4. 作成できたら LINE Developers コンソールでチャネルを開く。

## 2. チャネルアクセストークンを発行する

1. チャネルの「Messaging API設定」タブを開く。
2. 一番下の「チャネルアクセストークン(長期)」の「発行」を押す。
3. 表示された長い文字列をコピーする(これが `LINE_CHANNEL_ACCESS_TOKEN`)。
   ⚠️ このトークンは秘密情報。リポジトリやチャットに貼らないでください。

## 3. 応答設定を整える(任意だが推奨)

LINE Official Account Manager(manager.line.biz)で:
- 「応答設定」→ あいさつメッセージ: オフ or 簡単な文に
- 「応答設定」→ 応答メッセージ: オフ(自動返信の「ありがとうございます!」を止める)
- Webhookは使わないのでオフのままでOK。

## 4. Claude Code の環境変数にトークンを登録する

1. https://claude.ai/code (またはClaudeアプリ)で、このセッションが動いている
   **環境(Environment)の設定**を開く。
2. 環境変数に以下を追加:
   - 名前: `LINE_CHANNEL_ACCESS_TOKEN`
   - 値: 手順2でコピーしたトークン
3. 保存。次回セッション起動(次の巡回)から有効になります。

## 5. 家族が友だち追加する

1. LINE Developers の「Messaging API設定」タブ(またはOfficial Account Manager)に
   QRコードがあるので、家族全員のLINEで友だち追加。
2. レポートは「ブロードキャスト送信」なので、友だち追加した人全員に届きます。

## 6. 動作確認

Claudeに「LINEテスト送信して」と伝えると、`scripts/line_report.sh` でテスト
メッセージを送ります。家族のLINEに届けば完了です。

## 備考

- 無料プランの送信上限は月200通(受信者ごとに1通カウント)。
  週2回 × 家族分でも十分収まりますが、家族5人×週2なら月約45通です。
- トークンを再発行した場合は環境変数を更新してください。
- LINE側からの返信はこの仕組みでは受信できません。イベントの承認
  (カレンダー登録)はClaudeへの返信で行います。
