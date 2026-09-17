# ブランチを1本にまとめる — 方針

作成: 2026-09-17 ／ 対象: この会話（メイン）・SNS返信・Instagramリール

## 結論

**まとめられる。まとめたほうがいい。ただし一度にやらない。**

いま**6本**あり、うち**4本が同じ `events/` を別々に育てている。**
9/16 の3通配信は、まさに「片方のブランチにしか草案を置かなかった」ことが原因だった。

## いま何が起きているか（調べた事実）

| ブランチ | 中身 | 最終 | 役割 |
|---|---|---|---|
| **`family-event-planning-rfwmo8`** | events / reports / scripts 8本 | 09-17 | **アプリの既定。Routineが動く。LINE送信** |
| **`line-message-resend-yefv9l`** | homepage 195 / note 9 / scripts 35 | 09-16 | **ホームページを配信。**チラシ・docs |
| **`sns-reply-specialist-ebgdh9`** | rfwmo8と同じ構成 ＋ `events/2026-11.md` | 09-15 | SNS返信・情報集め。**台帳が独自に213行進んでいる** |
| `instagram-reel-handoff-ol20fs` | homepage 165 / note 6 / scripts 29 | 09-13 | リール |
| `handoff-docs-review-wn6glj` | homepage 70 / scripts 16 | 09-02 | 止まっている。**未消化の宿題あり** |
| `wednesday-routine-github-access-nrhf89` | ほぼ空 | 07-07 | 死んでいる |

### 🔴 いちばんの証拠

`update-homepage-preview.yml` は、**2つのブランチを両方チェックアウトして、片方からもう片方へ push している。**

```yaml
- checkout  ref: rfwmo8            # reports と script はこっち
- checkout  ref: yefv9l  path: site # homepage はこっち
- run: node scripts/update-homepage-preview.mjs site/docs/homepage/index.html
- push origin yefv9l
```

**分かれていることを回避するためだけの仕掛けが、すでに組まれている。**
しかも `GITHUB_TOKEN` の push は他のワークフローを起動しないので、
**Pages の公開処理をここに二重に持っている。**1本なら全部いらない。

### いまの配線

- `deploy-homepage.yml` … **yefv9l** への push（`docs/homepage/**`・`data/**`・`events/**`）で発火
- `note-draft.yml` … `ref: yefv9l`
- `post-threads.yml` / `social-drafts.yml` / `update-homepage-preview.yml` … **rfwmo8**
- Routine（毎週水曜09:00 JST）… **rfwmo8**

**ホームページのパイプラインが、2本のブランチにまたがって割れている。**

## まとめる利点

1. **台帳が1つになる。**いま4本が別々に育てている。9/16 は E108〜E110 を
   2本が**同じIDで別のイベント**に使っていた（統合時に発見・振り直し済み）
2. **`update-homepage-preview.yml` のブランチまたぎが消える。**Pages の二重公開も
3. **「片方にだけ直した」事故が原理的に起きなくなる。**9/16 の原因そのもの
4. **手で運ぶ作業が消える。**いまは `sent.log` や `CLAUDE.md` を人が運んでいる
5. **どの会話からでも最新が見える。**SNS返信の会話が集めた情報が、その場で巡回に効く

## まとめる欠点（正直に）

1. 🔴 **push がぶつかるようになる。**いまは会話ごとに孤立していてぶつからない。
   1本にすると、同じファイルを同時に触ると**push が弾かれる。**
   （2026-09-16 に実際1回起きた。note の会話とぶつかって rebase した）
   → **ただしこれは「衝突が見えるようになる」だけ。**いまは衝突が見えないまま
   両方が別々に正しくなっていて、そちらのほうが危ない
2. 🔴 **事故の影響範囲が広がる。**いま yefv9l で何かを壊しても Routine は無事。
   1本にすると、壊したものを Routine が拾いうる
   → 対策: **会話ごとに触る場所を決める**（下記）
3. **Routine のセッションが重くなる。**rfwmo8 に homepage 195ファイルが乗る。
   ただし Routine が読むのは `events/` と `reports/` だけなので実害は小さい
4. **`deploy-homepage.yml` が台帳更新のたびに走る。**Routine が毎週 events を更新するため。
   → むしろ望ましい（いまは手で運んでいる）。ただし
   🔴 **「読者より先にサイトに出さない」ルールが効いているかは、切り替え後に必ず確かめる**
5. **Routine の紐付け変更は git の外。**claude.ai の設定画面での作業になる
   → **だから幹は rfwmo8 のままにする。**紐付けを触らずに済む

## 幹はどれにするか

**`claude/family-event-planning-rfwmo8`。**理由は動かせないものが2つあるから。

- **アプリの既定ブランチ**（新しい会話がここから始まる）
- **Routine が紐付いている**（変更は claude.ai の設定作業）

中身の量は yefv9l のほうが多いが、**中身は動かせる。配線は動かしにくい。**

> `main` に改名するのは、**全部が1本に乗ったあと**でよい。先にやると移動先が増える。

## 段取り（この順に）

### 第1段階 — 死んでいる2本を畳む（すぐできる・リスクほぼ無し）

- `wednesday-routine-github-access-nrhf89` … 07-07 で停止。**そのまま消してよい**
- `handoff-docs-review-wn6glj` … 09-02 で停止。**先に宿題を消化する:**
  - `docs/backport-to-rfwmo8.md` の①（`splitItems`）は**反映済みを確認した**
  - ②が**未消化**: `reports/free/2026-07-08.md` と `2026-07-11.md` の末尾に
    `</content>` が残っている。**直してから畳む**

### ✅ 第1段階は完了した（2026-09-17）

宿題を消化してから、2本を消した。

- ✅ `docs/backport-to-rfwmo8.md` ①（`splitItems`）… **すでに反映済みだった**
- ✅ ②`reports/free/2026-07-08.md` / `2026-07-11.md` の末尾 `</content>` … **両ブランチで削除**
- ③④は「急ぎではない」注記と運用の助言で、直すコードは無い

**消す前に確かめたこと**: 2本のどちらにも、
**rfwmo8 にも yefv9l にも無いファイルは1つも無かった。**
中身が違うファイルはあるが、すべて古い時点のもの（09-02 と 07-07 の写し）。

**消したブランチと、その先頭**（戻すときはこのSHAを使う）:

| ブランチ | 先頭 | 最終 |
|---|---|---|
| `claude/handoff-docs-review-wn6glj` | `16d16cb3ec7e09968db6f94defbd5bd5b41c7eed` | 2026-09-02 |
| `claude/wednesday-routine-github-access-nrhf89` | `4c757b1a82c11837e8848d40549a644cb52fc2c9` | 2026-07-07 |

> 🔴 **この箱からはブランチを消せない。**セッションのgitプロキシが
> **refの削除とタグのpushを拒む**（`git push --delete` も `push <tag>` も
> `send-pack: unexpected disconnect` で落ちる。4回ずつ試して同じ）。
> GitHub MCP にも削除の道具は無い（`create_branch` はあるが `delete_branch` は無い）。
> **削除だけはオーナーがGitHubの画面でやる:**
> https://github.com/taniurah-lgtm/Bon-voyage/branches の 🗑 を押す。
>
> **これは第2段階以降にも効く。**中身の合流はこちらでできるが、
> **合流後のブランチ削除は毎回オーナーの手作業になる。**
>
> 戻すときは GitHub の「Restore branch」か、
> `git push origin <SHA>:refs/heads/<名前>`。

### 第2段階 — SNS返信ブランチを合流（構成が同じなので楽）

`sns-reply-specialist-ebgdh9` は rfwmo8 と**同じファイル構成**。差は台帳だけ。

- `events/2026-11.md`（向こうにしかない）を rfwmo8 へ
- `events/2026-09.md` の独自213行・`2026-10.md` の82行を統合
  🔴 **ID衝突が出る前提で見る。**9/16 に E108〜E110 で実際起きた
- 統合できたら、SNS返信の会話の push 先を **rfwmo8 に変える**

### 第3段階 — ホームページ側を合流（ここが本丸）

- `yefv9l` の `docs/homepage/` `note/` `scripts/` を rfwmo8 へ
- `deploy-homepage.yml` と `note-draft.yml` の**向き先を rfwmo8 に変える**
- `update-homepage-preview.yml` から**ブランチまたぎを削る**（checkout 1回・push なし）
- 🔴 **切り替え後、次の配信で「読者より先にサイトに出ていないか」を必ず確かめる**

### 第4段階 — リールの会話を乗り換え

`instagram-reel-handoff-ol20fs` の成果物を rfwmo8 へ。以降の push 先も rfwmo8。

### 第5段階 — ルールを1本に

- `CLAUDE.md` の「push先は rfwmo8 のみ」を、**例外なしの一文**にする
- `docs/backport-to-rfwmo8.md` は役目を終えるので**消す**
- 各会話に、新しい push 先を伝える

## 1本にしたあとの決めごと（事故を防ぐため）

1. **push の前に必ず `git fetch` → `git rebase origin/<branch>`。**いきなり push しない
2. **会話ごとに触る場所を決める。**同じファイルを2つの会話が同時に書かない

   | 会話 | 主に触る場所 |
   |---|---|
   | メイン | `docs/` `docs/homepage/` `scripts/build-*` |
   | 巡回（Routine） | `events/` `reports/` |
   | SNS返信 | `events/`（起票のみ）`data/` |
   | リール | `note/` `docs/homepage/assets/` |

   🔴 **`events/` は Routine と SNS返信が両方触る。**ここだけは、
   **SNS返信は新規起票だけ・既存行の書き換えはしない**と決めておく
3. **台帳のIDは、必ず既存の最大値+1から振る。**ファイル全体を見てから振ること
4. **配信の草案は `reports/free/YYYY-MM-DD.md` に置く。**
   Routine は「その日の号がすでにあれば書き直さない」（`docs/routines.md`）

## やらないこと

- **`reports/` と `sent.log` は統合しない。**あれは「何を送ったか」の記録で、
  rfwmo8 のものが正。揃えると嘘になる
- **一度に全部やらない。**段階ごとに、次の配信をはさんで様子を見る
