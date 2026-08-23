# rfwmo8 に戻す必要がある修正（この会話では push していない）

このブランチ（`claude/handoff-docs-review-wn6glj`）で直したが、**動いているのは rfwmo8 側**
なので、rfwmo8 に反映しないと本番は変わらないもの。

> この会話の push 先は `claude/handoff-docs-review-wn6glj` のみと指示されているため、
> rfwmo8 には触っていない。反映は rfwmo8 側の会話か、オーナーの指示で行う。

## 1. `scripts/update-homepage-preview.mjs` — 1セクションに2件あると融合する

**症状**: 2026-08-19号で「🎯こだわり縁日」と「📚クラシックポップアップ絵本展」が
トップページのプレビューで1件に混ざり、年齢目安が `👶○🧒◎🎒◎ 👶○🧒◎🎒◎` と二重に出ていた。

**原因**: `itemHtml(section.body)` がセクション本文を1件として扱っていた。

**直し方**: 行頭の絵文字を項目の始まりとみなして割る `splitItems()` を入れ、
`itemHtml(indoor.body)` → `splitItems(indoor.body).map(itemHtml).join('\n')` にする
（`ahead` など他のセクションも同様）。年齢目安の行（👶🧒🎒📍🔗⚠ 始まり）は
項目の始まりとみなさないこと。

このブランチの実装をそのまま取れる:
```
git checkout claude/handoff-docs-review-wn6glj -- scripts/update-homepage-preview.mjs
```
※ ただし workflow（`.github/workflows/update-homepage-preview.yml`）は rfwmo8 にしか無い。

## 2. `reports/free/2026-07-08.md` / `2026-07-11.md` — 末尾に `</content>` が残っている

**症状**: 会員ページのバックナンバーに `</content>` がそのまま出た
（生成側で `stripArtifacts()` を入れて表示上は消したが、**元のファイルが汚れたまま**）。

**直し方**: 両ファイルの末尾の `</content>` 行を削除する。表示側の応急処置ではなく、
元を直すのが正。

---
最終更新: 2026-08-23
