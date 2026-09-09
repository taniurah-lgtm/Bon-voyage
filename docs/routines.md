# 定期実行(Routine)の約束ごと

## 🔴 いちばん最初に add_repo を呼ぶ

定期実行で起動したセッションには、**このリポジトリが authorized set に入っていない**。
その状態では git プロキシが認証情報を注入しないので、`git clone` も `git push` も
`access denied by the git proxy ... 403` で必ず落ちる。

```
remote: access denied by the git proxy: taniurah-lgtm/Bon-voyage is not in this
session's authorized repository set, so the proxy will not inject a credential
for it. To fix, add the repository to the session's sources.
```

**対処**: セッションの最初に `add_repo` ツールを呼ぶ。
`owner: "taniurah-lgtm"` / `repo: "Bon-voyage"` / `access: "push"`。

⚠️ **2026-09-09 まで、3つのRoutineのプロンプトには
「認証はこの環境の git プロキシが持っているので、そのまま通る（検証済み）」と書いてあった。
これはもう正しくない。**この日、水曜巡回は09:08に発火して3分半で死んだ。
通信が届いたのは、オーナーとの対話セッションから手で送ったから。
**Routineは落ちたことを自分で報告できない。**

## 恒久的な直し方(オーナーの操作)

claude.ai/code の環境 `env_01WC6c8w1uivbK9U9HSb9KYU` の **sources に
`taniurah-lgtm/Bon-voyage` を追加する**と、発火したセッションに最初から
クローン済みで入る。そうなれば `add_repo` は `already_present` を返すだけなので、
プロンプト側の手順はそのままで問題ない。

## 二重配信を防ぐ

水曜は 09:00 の巡回と 11:30 の見張りが動く。加えて、オーナーとの対話セッションから
手で送ることもある(2026-09-09 がそうだった)。
**送る前に必ず `totalUsage` を見る。**今週ぶん増えていたら、もう届いている。
そのときは **LINEを送らず、ファイルのコミットとpushだけ**行う。

## 配信の記録

`scripts/publish_report.sh` は、配信のあとに `reports/free/sent.log` を commit & push する。
ホームページの「最新号のプレビュー」はこの記録を見て切り替わるので、
**push が通らないとサイトは前の号のまま**になる。
`scripts/line_report.sh` を直接叩くと、この push が行われない。

## Gmailのコネクタは付けない（2026-09-09 決定）

小金井公園から報道発表がメールで届くが、**Routineにメールを読ませない。**

理由は2つ。

1. 届く先の `tokyo.papa.home@gmail.com` は、**チラシとホームページに載せた公開の窓口**でもある。
   これから読者の問い合わせが来る。子どもの年齢や住んでいる場所が書かれた私信を、
   **誰も見ていない水曜の朝に自動処理の対象にしない。**
2. コネクタを付けたRoutineは、**無人で読むだけでなく書ける**（送信・削除・ラベル変更）。
   公式ドキュメントに「Claude can use every tool from an included connector,
   **including writes**, without asking for permission during a run」と明記されている。
   小金井公園から届くのは月に数通で、その代償に見合わない。

### かわりの回し方

1. 報道発表が届いたら、**オーナーがClaudeとの対話に貼る**
2. その場で `events/` に起票する
3. 水曜の巡回は `events/` を読む。**そこにもう入っている**

**人が濾し器になる。**台帳が正であることは変わらない。

🔴 **巡回のプロンプトに「受信箱を見る」と書かない。**
見に行けないので、空振りするか、見たふりの報告になる。
