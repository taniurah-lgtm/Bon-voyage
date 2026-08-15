# 引き継ぎ — Bon-voyage 全体状況（2026-08-15 時点）

新しいセッションは**まずこれを読む**。次に `CLAUDE.md` → `docs/sources.md`。

---

## 0. ブランチの使い分け（重要）

| ブランチ | 守備範囲 |
|---|---|
| **`claude/family-event-planning-rfwmo8`**（既定） | 台帳 `events/` ・巡回・レポート `reports/` ・**SNS自動化** ・プロフィール `profiles/` ・`CLAUDE.md` ・`docs/sources.md` |
| **`claude/line-message-resend-yefv9l`** | ホームページ `docs/homepage/` ・**印刷物** ・営業（アポリスト・マイマップ）・特商法・申請書類 |

**PRは作らない。** 非fast-forwardで弾かれたら `git pull --rebase` して1回だけ再試行（別セッションが並行して触る）。

---

# 🔴 A. 期限のあるもの

| いつまで | 何 |
|---|---|
| **8/19(水)** | **次回配信**。E47・E48・E51 を載せる |
| **8/23(日)** | E47 こだいら防災救急フェア 10:00〜13:00（中央公民館1階視聴覚室＋中央図書館北側駐車場）。**はしご車搭乗体験20組** |
| **8/24(月)** | E50 ピックルボール体験会 申込締切 |
| **8/28(金)** | **E48 ランニング教室**（9/6・小1〜4年・各70人）申込締切。**先取り枠に入れる価値あり** |
| 9/30 | 小川西町公民館が閉館。回るなら9月中 |
| **10/31** | **あすぴあが現施設で終了**。**ラック設置は移転前に済ませたい** |
| 11/1 | 小川パレット オープン（E54）。掲示ルールが固まる前が好機 |

> ❌ **E46 コマ回しは失注。** 締切8/14(金)を「8/14(木)」と誤転記し、配信前に過ぎた。台帳は `見送り`。

---

# B. LINE — 無料枠がもうすぐ足りない

- **友だち47人**。無料プランは**月200通**、ブロードキャストは**受信者ごとに1通**
- 水曜4回の月 = **188通**（ぎりぎり）／水曜**5回の月 = 235通 → 超過して配信が止まる**
- **周知が進むほど早く来る。** ライトプラン（月5,000円／5,000通）への切替時期を決めておく

**設定まわり**
- `scripts/line_report.sh` … **ブロードキャスト専用**（特定ユーザーへのpushはできない）
- `LINE_CHANNEL_ACCESS_TOKEN` は **2026-08-15 に再発行済み**。環境変数欄は**スクショに写さない**
- **公式アカウントの認証申請は提出済み**（審査中・約10営業日）
- リッチメニュー: 3ボタン。3つ目は「応援する」→**「会員ページ」に差し替え済み**
- 詳細は `docs/line-setup.md` / `docs/share-kit.md`

---

# C. SNS自動化（`docs/social-automation.md` / `scripts/social/README.md`）

## 現在地: **Phase 0（生成のみ・投稿しない）**

| 何 | 状態 |
|---|---|
| `social-drafts.yml` | **毎日 07:00 JST に稼働中**。Geminiで草案生成→コミット |
| `scripts/social/generate-drafts.mjs` | 台帳から Threads/X/Instagram/画像 の4ブロックを生成 |
| `scripts/social/render-ig-card.mjs` | Instagram用フィード画像 1080×1350 を生成 |
| `scripts/social/post-threads.mjs` ＋ `post-threads.yml` | **Phase 2。実装済みだが未稼働**（トークン未取得・手動実行のみ） |

## 運用（いまは手動コピペ）

毎朝ここを開く → ブロックをコピーして各SNSに貼る:
`social/drafts/latest.md`（前日ぶんは `social/drafts/YYYY-MM-DD.md`）
Instagram は同じ日付の `social/drafts/ig/YYYY-MM-DD.png` を保存して投稿。

アカウント: **@bonvoya_tokyo**（Instagram / Threads / X）

## 詰まっていること・弱点

1. **Threads自動投稿が止まっている。** Meta開発者登録がSMS認証で通らない。
   `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` を Secrets に入れれば**すぐ動く**状態
2. **IG用の自前写真がほぼ無い**（`social/photos/` に**2ファイルだけ**）。
   カテゴリ別ディレクトリ（park/water/fireworks/festival/indoor/museum/train/animal/camp/_default）は
   用意済みだが空。**空だとグラデーション背景にフォールバックする＝見栄えが弱い**
   → **公式サイトの画像は絶対に使わない。** 自前写真か商用ライセンス素材のみ（`social/photos/README.md`）
3. **生成が途中で切れる事故があった**（2026-08-02）。4ブロック揃っているかの検査と
   トークン量の再試行（8192→16384）を実装済み。⚠️ヘッダが付いていたら人が補う
4. Gemini のモデルは複数を順に試すフォールバック方式（新規キーで404/429になるため）

## Phase の予定

Phase 2: Threads → Phase 3: X（無料枠） → Phase 4: Instagram フィード

---

# D. 印刷物・販促物（`docs/pr-plan.md` / `docs/share-kit.md`）

すべて `docs/homepage/assets/` に生成済み。HTMLソースは `docs/homepage/*.html`。

| 種類 | ファイル | 状態 |
|---|---|---|
| **A5チラシ** | `flyer-a5-print.pdf`（3mm裁ち落とし） | **ラクスルで印刷済み・配布中** |
| **名刺サイズのカード** | `meishi-front.pdf` / `meishi-back.pdf` | **印刷済み。店に置くのはこれ** |
| A4ポスター | `poster-a4-print.pdf` | 印刷可 |
| ご自由にどうぞPOP | `pop-a7.pdf` / `pop-card.pdf` | カードスタンド用 |
| **ニコマル名刺** | `card-nicomaru-front-ai.pdf` / `-hiroaki.pdf` / `card-nicomaru-back.pdf` | ⚠️ **印刷しない**（裏面QRの `nicomaru.tokyo` が**未公開**） |
| X ヘッダー | `x-header.png`（1500×500） | |
| IG ストーリー | `ig-story.png` | |
| QRコード各種 | `site-qr.png` / `qr-hp.png` / `qr-line.png` ほか | |
| LINE用 | `line-cover.png` / `line-icon.png` / `richmenu.png` | |

**導線は全チャネルで「ホームページ経由」に統一済み**（チラシQR → `/f` → トップ → LINE）。
`/f` は `bv_from=flyer` を localStorage に記録する。

**ポスティング外注**（ラクスル）は `docs/pr-plan.md` に計画あり。**現在は保留**、
まず手配り＋設置で反応を見る段階。

---

# E. 営業（設置・掲示）

- **設置済2件**: しゅしゅ（パン屋）・ロースターズクラブ（自家焙煎珈琲）。**どちらも行きつけで通った**
- **交渉中1件**: 花小金井南公民館。副館長が「中身を見てから置いてみますね」で**止まったまま**
  → **催促ではなく「枚数が足りなければお持ちします」**の形でフォローする（042-461-0861）
- **アポリスト30件** `docs/apo-list.md`。回る順番つき
- **マイマップ運用中**（夫婦で共有）。`node scripts/build-apo-map.mjs` → KML/CSV
  - **色はマイマップ側で設定する**（KMLのアイコン色は読み捨てられる）。ExtendedDataで「ステータス」列を渡してある
  - 更新はマイマップ上でピンを動かすのが早い（再インポートは上書きされずレイヤーが増える）
- **重要な学び**: 2件とも**行きつけ**で通った。**飛び込み10軒より行きつけ3軒**

## あすぴあ 団体登録（提出直前）→ `docs/asupia-registration.md`

- **有料サポーター制度を説明したうえで登録OKを取得済み**
- **5人は数合わせでよいと確認済み**
- 構成員: 夫婦＋弟・弟の配偶者・妹（全員成人）。**3人への同意取得だけ残っている**（依頼文の案あり）
- 提出物: 登録届／会員名簿／**チラシ1枚**（活動報告は不要）／活動分野記入票
- **登録が通ったら `kodaira-navi.net`（こだいら市民活動ナビ）にも登録**＝無料の周知チャネル

---

# F. 有料（サポーター）まわり

| | |
|---|---|
| 課金 | **note メンバーシップ 月300円**（`https://note.com/bon_voyage_mail/membership`） |
| **特商法表記** | **公開済** `https://bonvoya.nicomaru.tokyo/tokushoho.html`。所在地・電話は**請求時開示**方式 |
| 会員ページ | `https://bonvoya.nicomaru.tokyo/m/s7f2ka/`。AES-GCM＋合言葉。**合言葉はリポジトリに保存しない** |
| ビルド | `MEMBER_PASS="…" node scripts/build-members.mjs` |
| 申込フォーム | `docs/support-form.md`（設問案）。**Googleフォームは未作成** |
| オンボーディング | `docs/onboarding-form.md` |
| 個別配信の設計 | `docs/paid-delivery.md` / `docs/paid-roadmap.md`（一部は**superseded**の注記あり） |
| 転換施策 | `docs/paid-conversion.md`（10案・実装状況つき） |

**note の請求日は 2026-08-03 に仕様変更**（毎月1日 → 入会日起算）。
8/2までに開設したメンバーシップは従来どおりの場合があり、**本件はどちらか未確定**。
特商法表記はどちらでも正しい書き方にしてある。

**実装済みの転換施策**: 案1（価格の再フレーミング）／案2（入会摩擦の削減）／案7（無料＝知る・有料＝決める動く の比較表）
**未着手**: 案5（土曜の直前チェックを主役に）／案3（うちの子仕様オンボーディング）／案8／案10

---

# G. プロフィール運用（`profiles/`）

| ファイル | 用途 |
|---|---|
| `free-hanakoganei.md` | **無料版の生成元**（エリア共通・週1・水のみ） |
| `taniura-hanakoganei.md` | オーナー家庭 |
| `example-koganei.md` | 例 |
| `_template.md` / `README.md` | 追加用のひな型・プライバシー方針 |

`plan: paid` のプロフィールを1枚置けば、次の巡回から個別配信の対象になる設計。
**現在 有料の購読者は0人**。

---

# H. ホームページ（`docs/homepage/`）

`docs/homepage/**` への push で **自動デプロイ**（`deploy-homepage.yml`）。

| ページ | |
|---|---|
| `index.html` | トップ。**最新号プレビューは自動更新**（下記） |
| `guide.html` | 花小金井 子連れおでかけガイド（実在スポット23件） |
| `map.html` | **みんなのおでかけマップ**。`node scripts/build-map.mjs` で生成 |
| `tokushoho.html` | 特商法表記・免責・個人情報の取り扱い |
| `m/s7f2ka/index.html` | 会員ページ（暗号化） |
| `f/index.html` | チラシからの着地。`bv_from=flyer` を記録してトップへ |

**最新号プレビューの自動更新**: `reports/free/**` を push すると
`update-homepage-preview.yml` が `index.html` の `<!-- ISSUE:START -->` 〜 `END` を書き換え、
**同じジョブ内でPagesもデプロイする**（GITHUB_TOKENのpushは他ワークフローを起動しないため）。

**SEO**: Search Console 登録済み。`sitemap.xml` / `robots.txt` あり（`/f/` と `/m/` は Disallow）。

---

# I. 投稿マップ（**保留中**）

`docs/map-form.md` / `scripts/gas/create-map-form.gs`

- **第1段階まで完了**: 公開マップ `map.html`（種データ23件）＋ Googleフォーム作成済み
  （`https://docs.google.com/forms/d/e/1FAIpQLSew4l.../viewform`。マップの「この地図に書き込む」に設定済み）
- **未実装**: `map-ingest.mjs`（CSV取り込み → 承認済みを反映）と日次の巡回
- **未完了の手作業**: 公開用シートの**CSVウェブ公開**と `MAP_SHEET_CSV` の Secrets 登録
- 線引き: 無料も40字まで投稿可／サポーターは長文・写真・全件閲覧
- **承認はスプレッドシートの「承認」列にチェック**（チャットで返信する必要なし）
- ⚠️ **回答シートには合言葉が平文で残る。絶対に共有・公開しない**

> **谷裏さんが「保留」と明言。再開の指示があるまで触らない。**

---

# J. 事故の記録（同じことを繰り返さないため）

### 1. 画像から転記したら36%間違えた
市報8/5号を私がスクショで読んで起票した E44〜E54 を公式PDFと突合 → **11件中4件が誤り**。
**E47は開催日を丸ごと8日ずらしていた**（防災週間の期間を開催日と誤読）。E46は曜日を誤り**締切を落とした**。
→ **画像は最後の手段。**順番は `docs/sources.md`「取り方の順番」を守る。

### 2. 「入場無料が基本」と書いたが、過半が有料だった
田無アスタ2Fセンターコート。**8月は800円/500円/300円と有料が過半**。
無料版は「無料・格安を上位に」が方針なので、**読者が実際にお金を払う実害**。
→ **「無料」と書く前に費用を確認する。**

### 3. 「読めないサイト」と誤診して2週間むだにした
アスタの月次表が画像だったので「Webに文字がない」と結論し、設計文書にまで書いた。**誤り。**
`asta.co.jp/event/` に本文テキストがあった。**一覧しか見なかったのが原因。**

### 4. 巡回設定はあるのに毎月0件だったが、誰も気づかなかった
アスタは「毎回巡回」なのに通信に一度も出ていなかった。**紙のチラシをもらって初めて発覚。**
同種で **イオンシネマ「げんきッズシアター」は制度終了**（`CLAUDE.md` に固有名が埋まっていた）。
検索インデックスに旧ページが残るので生きて見える。
→ **0件のソースを巡回レポートに1行残す。**（ルールは書いたが**強制する仕組みはまだ無い**）

### 5. HTTP 200 なのに中身は「Access Denied」だった
`curl` が200を返すのに本文はAkamaiの遮断ページ。さらに **curl と WebFetch で結果が割れる**。
→ 巡回は WebFetch を使うので **WebFetch側の可否が実運用の答え**。

### 6. LINEのトークンをスクショに写した
環境変数欄が平文で写り込んだ。**再発行済み。**

### 7. 「カレンダー登録代行」— 実装していないことを特典に書いていた
ホームページ・オンボーディング・計画書の全部に書いてあった。**ワンタップの自己登録**に訂正済み。
→ **できていないことを書かない。**

---

# K. 「やらないと決めたこと」（蒸し返さない）

| | 却下の理由 |
|---|---|
| **創刊サポーター枠**（案6） | 名簿・番号の管理が人数に比例して重い。**お金を求める側の都合が前面に出て品がない**。実装したが撤回 |
| **返金保証**（案9の一部） | note に個別返金の導線がない。書くと事故1・7と同じ乖離になる |
| **チラシに「有料への誘導は一切ありません」と刷る**（Gemini提案） | **虚偽**。QRの先に月300円の導線がある |
| **403の迂回に Gemini を使う** | 環境の README が「迂回せず報告せよ」と明記。正しい対処は許可リストを広げること（実施済み） |
| **マイ広報紙（mykoho.jp）** | Cloudflareのボット遮断。市報の正は**小平市公式のPDF** |
| **案4 見張り番** | 谷裏さんが明示的に見送り |
| **Canva連携** | 検討中のまま。導入していない |

---

# L. 環境・設定

- **ネットワークアクセス = Full**（環境名 `test1`）。2026-08 に Trusted から変更
- **本物の遮断は2件**: `kosodate.seiburailway.jp`（Cloudflare／本体 `www.seiburailway.jp` で代替可）
  / `www.city.higashimurayama.tokyo.jp`（CloudFront／代替なし・🔍運用）
- **`www.city.kodaira.tokyo.jp` は www 必須**（apexは接続を切られる）
- Secrets: `LINE_CHANNEL_ACCESS_TOKEN` / `GEMINI_API_KEY`
- 未登録: `THREADS_USER_ID` `THREADS_ACCESS_TOKEN` / `MAP_SHEET_CSV`
- PDF読み: **`poppler-data` が必須**。`-layout`（横組み）と `-bbox`（縦組み）を使い分け。**`-raw` 単独は禁止**

---

# M. 残っている弱点（正直な現状）

**「取る」は強くなったが、「取れていないことに気づく」は変わっていない。**

- 📄（直取り可）が28行まで増え、市報はPDF、アスタは本文テキストになった
- **しかし差分検出の仕組みが無い。** `data/snapshots/` も `fetch-sources.yml` も未実装
- **今回の改善は全部、人が気づいたから起きた。** システムが自力で検出したものは1件もない
- `確度: 未検証` は慣習であって、**未検証のまま配信されるのを止める仕組みはない**
- アスタの参加費・定員は**いまも画像側にしかない**

**次にいちばん効くのは差分検出**（`docs/architecture-ingest.md` 実装順3）。

---

# N. ファイルの地図

## rfwmo8（台帳・巡回・SNS）
```
CLAUDE.md                      巡回手順・レポート形式・フリーミアム方針
events/2026-07.md 2026-08.md   台帳（E1〜E65）
events/camp.md                 キャンプ
reports/ reports/free/         配信レポート
profiles/                      プロフィール（無料版の生成元含む）
scripts/line_report.sh         LINEブロードキャスト
scripts/update-homepage-preview.mjs
scripts/fetch-via-gemini.mjs   調べもの用（403の迂回には使わない）
scripts/social/                SNS自動化3本
social/drafts/ social/photos/  草案と写真素材（写真は2枚しかない）
docs/sources.md                巡回レジストリ＋取り方の順番
docs/architecture-ingest.md    取得層/変換層/検証層の設計
docs/social-automation.md      SNSのPhase設計
docs/freemium-plan.md          無料/有料の線引き・LINE無料枠
docs/paid-delivery.md docs/paid-roadmap.md docs/onboarding-form.md
docs/line-setup.md docs/share-kit.md
```

## yefv9l（ホームページ・営業・印刷物）
```
docs/homepage/                 サイト一式＋印刷物のHTML/PDF/PNG
docs/handoff.md                ← このファイル
docs/apo-list.md               アポリスト30件・実績・回る順番
docs/asupia-registration.md    あすぴあ登録の記入案
docs/paid-conversion.md        課金転換10案
docs/map-form.md               投稿マップのフォーム・承認フロー（保留）
docs/pr-plan.md                ポスティング外注の計画（保留）
docs/tokushoho-template.md     特商法のひな型と判断の記録
docs/support-form.md docs/surveys.md docs/share-kit.md
docs/prompts/gemini-apo-list.md
docs/handoff-map-form.md       フォーム作成の引き継ぎ（完了済み）
scripts/build-map.mjs build-apo-map.mjs build-members.mjs
scripts/gas/create-map-form.gs
data/apo-spots.json            アポ先30件（マイマップの元）
data/map-spots.json            おでかけマップの種23件
data/map-posts.json            承認済み投稿（いま空）
```
