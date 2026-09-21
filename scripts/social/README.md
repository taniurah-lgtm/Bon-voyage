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
2. **【Threads・紹介】** をコピー → Threadsに貼って投稿。飛び先 `bonvoya.nicomaru.tokyo/f` は入っている。
3. **【Threads・問いかけ】** は**別の日**に投稿する（1〜2日あける）。
   🔴 **リンクもハッシュタグも足さない。**足すと宣伝に見えて、返事が来ない。
4. **返事が来たら、おでかけマップの材料にする**。これが問いかけを出す本当の目的。

## 🔴 なぜ「紹介」と「問いかけ」の2本なのか（2026-09-21）

**返信の付く投稿のほうが伸びる**、という観測から。
（オーナーが見つけた例: 淡々とした告知は いいね9、
　最後に「この現象知ってますか？？」と問いかけたものは いいね338・返信35）

- **紹介**: これまでどおり。イベント名・日付・場所・子連れ視点＋リンク＋タグ
- **問いかけ**: 同じ対象について、**読んだ人が答えたくなる問い**で終える
- 🔴 **行ったことにしない。**「うちの子が」「先週行ったら」は**書かない。**
  **実際には行っていないので嘘になる**（`CLAUDE.md`「書いてよいこと・いけないこと」）
- ⭕️ **聞くのは「行く前に知りたいのに、公式に書いていないこと」。**
  混み具合・ベビーカー・駐車場・小さい子がどのくらい楽しめるか・近くのごはん
- ⭕️ **答えは、おでかけマップに書ける唯一の種類の情報**
  （マップだけは「実際に行ってよかった場所」と書ける。地元の家庭の持ち寄りだから）

## ❌ X と Instagram はやめた（2026-09-21・オーナー判断）

**反応が無く、投稿もしていなかった。**
下書きの生成も、Instagramカードの描画（`render-ig-card.mjs`）も外した。
**戻すなら git 履歴から。**`social/photos/` の自前写真は残してある。

## この先（トークンが揃ったら自動化）
- Phase 2: Threads 投稿（`post-threads.mjs` / `post-threads.yml` は実装済み・手動実行）。
  **Run workflow の `variant` で「紹介」「問いかけ」を選ぶ。**
- Threads自動化は、Meta開発者登録→トークンを Secrets に入れれば「Post to Threads」ワークフローで即可。

※キーは**コードに書かない**。必ず GitHub Secrets（暗号化）に置く。
