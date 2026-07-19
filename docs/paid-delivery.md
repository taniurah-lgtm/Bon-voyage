# 有料(応援サポーター)配信 運用手順 — Phase 0(手動MVP)

有料の人への配信は **手動(1:1 LINE/メール)＋会員ページ**。
カレンダー登録は **会員ページのワンタップ「カレンダーに追加」**(各自のGoogleカレンダーに保存)。決定履歴は `docs/paid-roadmap.md`。

## 前提
- 課金は **note メンバーシップ(月300円)**。特商法・支払・解約は note が内包。
- 個人情報(連絡先・Gmail)は **プロフィールに書かず、フォーム回答シートで別管理**(`docs/onboarding-form.md`)。
- カレンダー登録は **本人がワンタップで自分のカレンダーに保存**(Google テンプレリンク)。→ 誰のアドレスも出ない・代行不要・会員数に依存しない。

## 会員ページ
- URL: `https://bonvoya.nicomaru.tokyo/m/s7f2ka/`(推測しにくいパス＋`noindex`。当面のパイロット用ソフトゲート)
- ファイル: `docs/homepage/m/s7f2ka/index.html`
- 中身: 今週号(各おすすめに **📅カレンダーに追加＋📍地図＋🔗公式**)＋**バックナンバー**。
- ⚠ソフトゲート: URLを知れば誰でも閲覧可(静的Pagesのため真の認証はなし)。掲載はおでかけ情報＋カレンダーリンクのみ、**個人情報は載せない**。真の会員限定が要るなら note 限定記事へ(Phase 2)。
- 会員が増えたら: 会員ごとに別トークンのページ(`/m/<token>/`)を作るか、共通ページ＋個別調整。当面は1枚。

## 週次フロー(水・土)
1. **生成**: `plan: paid` かつ `active: true` の各人ぶんを `reports/<id>/YYYY-MM-DD.md` に生成(coverage/categories 絞込、各おすすめに📍地図＋公式、2歳連れ適性、camp_ok はキャンプ、末尾は有料版フッター＝会員ページ誘導)。**家族向けは台帳ID非表示**。
2. **会員ページ更新**: `docs/homepage/m/<token>/index.html` の今週号を差し替え、旧号を **バックナンバー**へ。日時が決まったイベントに **📅「カレンダーに追加」リンク**(Google テンプレ URL)を付ける。予約解禁日などもリマインダーとして📅化してよい。
3. **手渡し**: オーナーが各人へ本文をコピペで手渡し(LINE 1:1 or メール)。末尾に会員ページURL。**LINE本文は短く**、📅/📍/🔗の束は会員ページに置く。

## 📅「カレンダーに追加」リンクの作り方
Google カレンダーのテンプレ URL を組む(本人のカレンダーに保存されるだけ・作成者は本人):
```
https://calendar.google.com/calendar/render?action=TEMPLATE
 &text=イベント名
 &dates=YYYYMMDDThhmmss/YYYYMMDDThhmmss   (JST)
 &ctz=Asia/Tokyo
 &location=場所
 &details=📍地図URL / 🔗公式URL / 子連れメモ
```
- 終日は `dates=YYYYMMDD/YYYYMMDD`。
- リマインダーはテンプレでは付かない(各自のカレンダー既定)。会員には「よく使うなら通知の既定を設定してね」と案内してよい。

## (参考・不採用)Claude が共有カレンダーに代行登録する案
- 共有カレンダー「ぼんぼやーじゅ・おすすめ」(`tokyo.papa.home` 所有、ID: `86394dca0e3c789c348a961930f47263577a8caca2e79a09f062ba056744e479@group.calendar.google.com`)に Claude が書き込む案も動作確認済。ただし **作成者(creator)に Claude 連携先の個人アドレス `h.taniura…` が表示される**ため**不採用**。
- 個人非表示のまま共有カレンダー運用にするなら「Claude 連携先を `tokyo.papa.home` に切替(Gmail/Drive も切替)」か「週次 `.ics` をオーナーが `tokyo.papa.home` でインポート」が必要。将来必要になったら検討。

## ドッグフーディング(最初の1人=自分)
- `profiles/taniura-hanakoganei.md` を `plan: paid`/`delivery: manual` に設定済。会員ページは `/m/s7f2ka/`。

## 卒業条件(手動 → 仕組み化)
- 人数が増えたら `docs/paid-roadmap.md` Phase 2(note 限定記事 or LINE narrowcast)へ。会員ページの真ゲートが要るなら note 限定へ。
