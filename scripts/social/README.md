# SNS自動投稿（Phase 0）

設計は `docs/social-automation.md`。ここは **Phase 0（生成のみ・投稿しない）** の実装。

## いま動くこと
- 毎日 07:00 JST（`.github/workflows/social-drafts.yml`）に `generate-drafts.mjs` が走り、
  `events/` の台帳から Gemini で **Threads/X のドラフト**を作って `social/drafts/YYYY-MM-DD.md` にコミットする。
- **投稿はまだしない**。生成物を人が見て確認する「承認ゲート」段階。

## 準備（オーナー）
1. `GEMINI_API_KEY` を発行（[Google AI Studio](https://aistudio.google.com/) / tokyo.papa.home）。
2. GitHub → **Settings → Secrets and variables → Actions → New repository secret** に
   `GEMINI_API_KEY` を登録。
3. （任意）モデル名を変えたいときは同じ画面の **Variables** に `GEMINI_MODEL`（例 `gemini-1.5-flash`）。
4. 手動テスト: Actions タブ →「SNS drafts」→ **Run workflow**。`social/drafts/` にファイルができる。

## この先（未実装）
- Phase 2: Threads 投稿、Phase 3: X（無料）、Phase 4: IG フィード。
- 承認方法（LINE/Slack 通知→1タップ）や全自動化は Phase 2 以降で。トークンが揃い次第、順に追加する。

※キーは**コードに書かない**。必ず GitHub Secrets（暗号化）に置く。
