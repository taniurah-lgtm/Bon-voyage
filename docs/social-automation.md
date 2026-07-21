# SNS自動投稿アーキテクチャ（X / Threads / Instagram）

目的: 公式の子育て・イベント情報を巡回し、「こんなの上がっていたよ🎈」形式で**毎日自動投稿**してフォロワーを獲得する。飛び先はHP `/f`（動線統一）。トーンは `CLAUDE.md` の方針（売り込まない・家族向け・裏取り）を踏襲。

---

## 0. 先に知っておくべき制約（設計の前提）

- **Instagram**: Graph API（Content Publishing）で**自動投稿できるのはフィード（画像/カルーセル/リール）だけ**。**ストーリーズはAPI非対応**（自動化できない＝手動 or 準公式ツールでリスク）。要「プロアカウント＋Facebookページ連携」。
- **Threads**: 公式 **Threads API**（Meta Graph）でテキスト/画像を投稿可。**無料・比較的緩い**。いちばん自動化しやすい。
- **X（旧Twitter）**: API v2。**無料枠は書き込み上限が厳しい**（月数百〜1,500程度・変動）。毎日＋画像なら **Basic（有料 月$100前後）** が現実的。まずは無料枠でテキスト中心が無難。
- **著作権・引用**: 他人の“投稿”をそのまま転載はNG。**公式ページの“事実（イベント名・日時・場所）を要約**し、**出典リンクを付けて紹介**する形にする（＝安全＆信頼）。画像の無断転載はしない。
- **品質リスク**: 日付誤り・トーン崩れを防ぐため、**最初は人の承認ゲート（1タップ承認）**を挟み、信頼できてから全自動へ。
- **日次の“ネタ切れ”**: 地域限定だと毎日新規は薄い。**コンテンツを混ぜる**（新規イベント／定番スポット／週末の天気提案／過去の振り返り／連休先取り）。LLMにローテーションさせる。

---

## 1. 共通パイプライン（どのアーキテクチャも同じ骨格）

```
[1 収集] 公式ソース巡回(sources.md/RSS/検索)
        ↓
[2 重複除去] 既出ストア(Sheet/DB)と照合
        ↓
[3 選定・生成] LLM(Gemini/Claude)で1〜3件選び「紹介文」を生成(トーン適用・出典付き)
        ↓
[4 画像(任意)] テンプレ画像(HTML→PNG)or 既存写真 or なし(テキストのみ)
        ↓
[5 承認(初期)] LINE/Slack/Notionに下書き→1タップ承認  ← 慣れたら省略
        ↓
[6 投稿] X / Threads / Instagram(feed) にAPI投稿
        ↓
[7 記録] 投稿ログをSheet/リポジトリに保存(再投稿防止・効果測定)
```

「賢い部分(1〜3)」と「投稿部分(6)」を分離すると、どの土台でも組み替えやすい。

---

## 2. アーキテクチャ候補

### A. n8n をハブにする（自己ホスト・最も自由）
- n8nの**日次ワークフロー**: RSS/HTTPで収集 → 重複除去(n8n＋Google Sheet/Airtable) → **Geminiノード**で生成 → (画像) → X/Threads/IG へ投稿ノード/HTTPリクエスト → Sheetにログ。
- ﾒﾘｯﾄ: 多SNS・分岐・再試行が視覚的に組める。自己ホストで低コスト。承認ゲートもLINE/Slackノードで容易。
- ﾃﾞﾒﾘｯﾄ: 各SNSの認証情報を自分で用意。n8nの運用(サーバ/更新)が要る。

### B. Claude Code の定期実行(Routines)を使う（**既存資産を再利用**）
- このリポジトリは既に**検証済みソース(sources.md)＋週次巡回＋トーン規約**を持つ。日次Routineで: 既存巡回 → SNS下書き生成(Claudeが得意) → `scripts/social_post.*` でAPI投稿 → ログをコミット。
- ﾒﾘｯﾄ: **巡回・裏取り・トーン適用をClaudeがそのまま**担える。台帳と一貫。承認は既存のLINE/チャットに流せる。
- ﾃﾞﾒﾘｯﾄ: 日次でセッションコスト。投稿APIの認証は別途。fresh-sessionトリガーはMCP無しなのでスクリプト投稿にする。

### C. GitHub Actions(cron) ＋ スクリプト ＋ LLM API（サーバレス）
- 日次cronのAction: Python/Nodeで 収集 → Gemini APIで生成 → X/Threads/IG APIへ投稿。状態(既出リスト)はリポジトリのJSON or Gist/Sheet。
- ﾒﾘｯﾄ: 無料CI・バージョン管理・サーバ不要。シンプルで壊れにくい。
- ﾃﾞﾒﾘｯﾄ: コードは自作。SNS認証はActionsのSecretsに。承認ゲートは別途(Issue/PR承認等)。

### D. Make.com / Zapier（ノーコードSaaS）
- n8n相当をSaaSで。X/Meta系モジュール＋LLM(Gemini/OpenAI)モジュールを繋ぐ。
- ﾒﾘｯﾄ: 立ち上げが最速・サーバ不要。
- ﾃﾞﾒﾘｯﾄ: 量が増えると月額。IG/Threadsモジュールの対応状況に依存・柔軟性は低め。

### E. 生成はLLM＋配信はソーシャル予約ツール（Buffer/Publer等）
- LLMで**週まとめて下書き生成** → **Buffer/Publer/Hootsuite**のキューへ（API or 手動承認）。各SNSの投稿・時間割は予約ツールが面倒を見る。
- ﾒﾘｯﾄ: **IG投稿やマルチSNSの面倒をツールが吸収**。人の承認を挟みやすい。
- ﾃﾞﾒﾘｯﾄ: 予約ツールの月額。IG自動公開はプラン依存。

### 比較

| 観点 | A n8n | B Claude Routines | C GH Actions | D Make/Zapier | E 予約ツール |
|---|---|---|---|---|---|
| 立ち上げ速さ | 中 | 中(既存流用) | 中 | **速** | **速** |
| 収集・裏取りの賢さ | 中(要設計) | **高(既存)** | 中 | 低〜中 | 低〜中 |
| 多SNS対応 | **高** | 高(要実装) | 高(要実装) | 中 | **高** |
| ランニングコスト | 低(自己ホスト) | 中(セッション) | **低** | 中〜高 | 中 |
| 保守の軽さ | 中 | 中 | **高** | **高** | **高** |
| 承認ゲート | 容易 | 容易 | 要工夫 | 容易 | **容易** |

---

## 3. おすすめ（段階導入）

- **土台は C（GitHub Actions）or B（Claude Routines）** を推奨。理由: サーバ維持が不要 or 既存の巡回資産を再利用でき、リポジトリと一貫。
- **まずThreads中心**で開始（API無料・自動化容易）→ **X（無料枠でテキスト）** を追加 → **IG feed**（画像＋プロアカウント整備後）。
- **Phase 1**: 収集→生成→**LINE/Slackに下書き→1タップ承認→投稿**（誤爆防止）。
- **Phase 2**: 精度が安定したら**承認を外して全自動**。曜日で内容ローテ（新規/定番/天気/振り返り/連休）。
- **LLM**: 下書き生成は **Gemini(API/AI Studio)** で十分。トーン・出典ルールをプロンプトに固定。Claude Routinesなら生成もClaudeで一体化。
- **画像**: 既存の `flyer`/`ig-story` と同じ **HTML→PNG テンプレ**で「イベント名＋日付＋場所」のカードを量産可（このリポジトリの手法を流用）。

---

## 4. 実装の分解（土台に依存しない部品）

1. **ソース定義**: `docs/sources.md` を機械可読化（RSSのある先はRSS、無い先は許可された範囲でHTTP/検索）。robots.txt遵守。
2. **既出ストア**: Google Sheet or リポジトリJSON（`data/posted.json`）。キーはURL+日付。
3. **生成プロンプト**: 「こんなの上がってたよ🎈」テンプレ＋トーン規約＋出典必須＋140字/500字の各SNS長さ。
4. **投稿クライアント**: `scripts/social/{x,threads,ig}.*`（各API・OAuthトークンは環境変数）。
5. **承認ボット(初期)**: 下書きをLINE/Slackへ、👍で投稿。
6. **効果測定**: フォロワー数・クリック（`/f`流入）・投稿ログを週次で集計。

---

## 4.5 決定事項（2026-07-21）＋実装計画

- **土台: C（GitHub Actions・cron）**に決定。
- **優先順位: Threads → X → Instagram(feed)**（推奨どおり）。
- **X は無料枠**（テキスト中心・書き込み上限に注意）。
- **承認ゲート: 最初は挟む**（誤爆防止。ドラフトを確認→投稿）。安定したら全自動へ。
- **設置ブランチ: `claude/family-event-planning-rfwmo8`（デフォルト＝cronが動く唯一の場所）**。LINE巡回と同居。

### フェーズ分け（認証情報の準備順）
| Phase | 内容 | 必要な認証（GitHub Secrets） |
|---|---|---|
| **0 骨組み** | 収集→生成→**ドラフトをリポジトリに出力（投稿しない dry-run）**。cronワークフロー。 | なし（テンプレ生成）or `GEMINI_API_KEY` |
| **1 文章生成** | Geminiで「こんなの上がってたよ🎈」文をトーン適用・出典付きで生成 | `GEMINI_API_KEY` |
| **2 Threads投稿** | 承認後 or 自動で Threads へ投稿 | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` |
| **3 X投稿(無料)** | X へテキスト投稿（無料枠） | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` |
| **4 IGフィード** | IGフィードへ画像投稿（プロアカ＋FBページ連携） | `IG_USER_ID`, `IG_ACCESS_TOKEN` |

### 認証情報の取り方（オーナー作業・Search Consoleと同じノリ）
- **Gemini**: [Google AI Studio](https://aistudio.google.com/) → APIキー発行（無料枠）。tokyo.papa.home でOK。
- **Threads**: Meta for Developers でアプリ作成 → Threads APIを有効化 → **Threadsユーザーアクセストークン＋ユーザーID**（長期トークンは約60日で更新要）。
- **X（無料）**: [X Developer](https://developer.x.com/) でProject/App作成 → 投稿には **OAuth1.0a** の API Key/Secret＋Access Token/Secret（Read and Write権限）。
- **Instagram**: プロアカウント＋Facebookページ連携 → Metaアプリで `instagram_content_publish` 権限 → IGユーザーID＋アクセストークン。
- 取得した値は **GitHubリポジトリ → Settings → Secrets and variables → Actions** に登録（コードには絶対に書かない）。

## 5. 未確定・要判断
- どの土台（B/C/D/E）で始めるか。
- 対象SNSの優先順位（推奨: Threads→X→IG feed）。
- X有料（Basic $100/月）を使うか、当面無料枠テキストのみか。
- 承認ゲートを挟むか（推奨: 最初は挟む）。
- IGストーリーズは自動化不可 → フィード中心にするか、ストーリーズだけ手動にするか。
