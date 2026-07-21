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

## いまの運用（手動コピペ）
Threads APIのトークン取得は保留中のため、当面は**手で貼る**運用:
1. 毎朝、最新の草案を開く（いつも同じURL）:
   `https://github.com/taniurah-lgtm/bon-voyage/blob/claude/family-event-planning-rfwmo8/social/drafts/latest.md`
   （GitHubにログインした状態で。前日ぶんは `social/drafts/YYYY-MM-DD.md`）
2. 【Threads】ブロックをコピー → Threadsアプリに貼って投稿。
3. 【X】ブロックをコピー → Xに貼って投稿。
4. 飛び先リンク `bonvoya.nicomaru.tokyo/f` はそのまま入っている。

## この先（トークンが揃ったら自動化）
- Phase 2: Threads 投稿（`post-threads.mjs` / `post-threads.yml` は実装済み・手動実行）。
- Phase 3: X（無料）、Phase 4: IG フィード。
- Threads自動化は、Meta開発者登録→トークンを Secrets に入れれば「Post to Threads」ワークフローで即可。

※キーは**コードに書かない**。必ず GitHub Secrets（暗号化）に置く。
