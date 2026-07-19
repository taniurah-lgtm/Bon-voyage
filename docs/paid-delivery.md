# 有料(応援サポーター)配信 運用手順 — Phase 0(手動MVP)

有料の人への配信は **手動(1:1 LINE/メール)＋会員ページ**。
カレンダー登録は **会員ページのワンタップ「カレンダーに追加」**(各自のGoogleカレンダーに保存)。決定履歴は `docs/paid-roadmap.md`。

## 前提
- 課金は **note メンバーシップ(月300円)**。特商法・支払・解約は note が内包。
- 個人情報(連絡先・Gmail)は **プロフィールに書かず、フォーム回答シートで別管理**(`docs/onboarding-form.md`)。
- カレンダー登録は **本人がワンタップで自分のカレンダーに保存**(Google テンプレリンク)。→ 誰のアドレスも出ない・代行不要・会員数に依存しない。

## 会員ページ(合言葉ゲート)
- URL: `https://bonvoya.nicomaru.tokyo/m/s7f2ka/`(＋`noindex`)
- ファイル: `docs/homepage/m/s7f2ka/index.html`、**ビルド: `scripts/build-members.mjs`**
- 中身: おでかけカレンダー(全予定・各予定に📅追加/📍地図/🔗公式)＋バックナンバー＋投稿マップ(準備中)。
- **ゲート方式 = 合言葉＋クライアント側AES-GCM暗号化**: 中身を暗号化して配信し、正しい合言葉を入れた人だけブラウザ内で復号。**合言葉を知らない人はソースを見ても中身が読めない**(=本物のゲート)。
  - **会員用**と**身内用**の2つの合言葉に対応(どちらでも解錠)。身内は「特別に」身内用を渡す。
  - **合言葉はリポジトリに保存しない**。ビルド時に環境変数で渡す:
    `MEMBER_PASS=xxx INSIDER_PASS=yyy node scripts/build-members.mjs`
  - 出力(index.html)は暗号文(salt/iv/ciphertext)のみ。合言葉はPBKDF2で鍵導出するため復元不可。
  - 合言葉を変える/失効させる → 新しい合言葉で再ビルドしてpush。
- **限界(正直に)**: 合言葉は共有シークレット(個人アカウントではない)。渡された人が第三者に教えれば使える。掲載は個人情報を含まないおでかけ情報のみ。per-person認証が要るなら note 限定記事へ(Phase 2)。
- 会員が増えたら: 共通1枚のまま合言葉運用でOK。厳密な個別管理が要るなら `/m/<token>/` を分けるか note へ。

### 有料会員→会員ページの動線
1. ホームページ「応援する」→ note メンバーシップ(300円)参加。
2. 参加者へ **会員ページURL＋合言葉** を渡す。合言葉は公開通信に載せず、**note メンバー限定投稿** か **LINE 1:1** で(課金者だけが知れる)。文面テンプレは `docs/share-kit.md`「5. 有料会員へのご案内」。
3. 会員ページで合言葉入力 → おでかけカレンダー等が表示。身内は同じ合言葉をオーナーが個別に伝える。
4. 有料レポート/無料フッターの会員ページ誘導には「初回は合言葉が必要(参加時にお伝え)」を明記済。

### 週次の更新手順
1. `scripts/build-members.mjs` の `E`(イベント配列)を最新の台帳に合わせて更新。
2. `MEMBER_PASS=… INSIDER_PASS=… node scripts/build-members.mjs` で再ビルド。
3. commit & push(`docs/homepage/**` でPagesデプロイ)。

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
