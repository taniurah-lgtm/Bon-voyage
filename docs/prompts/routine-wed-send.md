水曜の**配信（09:00）**。06:55 の準備Routineが作った号を、LINEに送る。**号は書き直さない。**

★このプロンプトの正本は リポジトリの `docs/prompts/routine-wed-send.md`。直すときは両方直す。
★2026-09-27 オーナー決定: **ページを先に出し、1時間後にLINEを送る**（LINEを受け取ってすぐリンクを押す人が多い）。

## 手順0 リポジトリを使えるようにする（いちばん最初にこれ）

**まず `add_repo` ツールを呼ぶ。** 引数は `owner: "taniurah-lgtm"` / `repo: "Bon-voyage"` / `access: "push"`。

🔴 **これを飛ばすと git は必ず403で落ちる**（2026-09-09に発生）。
定期実行のセッションは、リポジトリが authorized set に入っていない状態で起動することがある。
その状態では git プロキシが認証情報を注入しないので、clone も push も
`access denied by the git proxy ... 403` で失敗する。

`add_repo` を呼んだら、返ってきたパス（`/home/user/bon-voyage` など）を使う。
`status: already_present` なら再クローンしない。

```bash
REPO=$(ls -d /home/user/Bon-voyage /home/user/bon-voyage 2>/dev/null | head -1)
if [ -z "$REPO" ] || ! git -C "$REPO" rev-parse HEAD >/dev/null 2>&1; then
  git clone https://github.com/taniurah-lgtm/Bon-voyage /home/user/bon-voyage
  REPO=/home/user/bon-voyage
fi
cd "$REPO" && git rev-parse --show-toplevel && git branch --show-current
```

clone は5〜10分かかることがある。**タイムアウトを長めに取り、途中で諦めない。**

**`ls /` や `ls /mnt` や `find / -name .git` で探し回らない。**
無いのは置き場所の問題ではないので、探しても見つからない。承認する人も居ないので、
探索コマンドを打った時点で承認待ちになり巡回が死ぬ。
`add_repo` と上のコマンドが両方失敗したときだけ、**その出力の原文**を報告して終わる。

作業ブランチは `claude/family-event-planning-rfwmo8`。別ブランチにいたら
`git checkout claude/family-event-planning-rfwmo8 && git pull --rebase origin claude/family-event-planning-rfwmo8`。
コミット・pushはこのブランチだけ。PRは作らない。

★2026-09-18、ブランチを1本にまとめた。台帳もホームページもnoteも、すべてこのブランチにある。
他のブランチから何かを取り直す必要はない。

## 手順1 二重配信の防止（最優先・30秒）

```bash
D=$(TZ=Asia/Tokyo date +%Y-%m-%d)
ls -l reports/free/$D.md reports/free/web/$D.json
tail -3 reports/free/sent.log
curl -sS -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" "https://api.line.me/v2/bot/message/quota/consumption"
```

**`sent.log` の最後の行が今日**、または **`totalUsage` が今週ぶん増えている**なら、**送らない。**
「✅ 配信済み。送信しませんでした」と1行報告して終わる。

## 手順2 号とページがそろっているか

- `reports/free/<今日>.md` が**無い** → 準備Routineが落ちている。**あなたが準備をやり直す**:
  `docs/prompts/routine-wed.md` を読み、その手順（手順2〜5）で号と年齢別ページの材料を作って push し、
  ページが開けるのを確かめてから、手順3へ進む（**このときは1時間待たなくてよい**。遅れるほうが悪い）
- 号があるなら、**中身を書き直さない。**触ってよいのは**天気の行**だけ（ウェザーニュース 小平市で取り直す）

3つのページを確かめる:

```bash
for k in baby pre elem; do
  curl -s -o /dev/null -w "$k %{http_code}\n" "https://bonvoya.nicomaru.tokyo/week/$D/$k/"
done
```

- **3つとも 200** → 手順3へ
- **404 がある** → 2分おきに最大20分待つ。それでも 404 なら、GitHub Actions の「Deploy homepage」を
  `workflow_dispatch` で動かせるなら動かし、さらに10分待つ。**それでもだめなら送る**
  （リンク先には「いま準備しています」の案内が出る）。**最終メッセージのいちばん上に書く**

## 手順3 配信（必ずこの1コマンド）

```bash
scripts/publish_report.sh reports/free/$D.md
```

事前検査 → 残枠の確認 → commit → push → **pushが通ったときだけLINE配信** → **`sent.log` を push**。

- **`scripts/line_report.sh` を直接叩かない** / **手で `sent.log` に書き足さない**
- **無料枠を超えて止まった場合、勝手に `--force` を付けない。**残枠と必要通数を報告して指示を待つ

## 手順4 送ったあと

- 3つのリンクをもう一度 `curl` して 200 を確かめる
- 🔴 **多摩六都の広報さんへの「載せました」報告の約束がある号**（台帳に書いてある）は、最終メッセージでオーナーに知らせる

## 最終メッセージ（必須）

1. `add_repo` の結果
2. 手順1の判定と `totalUsage` の実数
3. 号のファイルが既にあったか／自分で作ったか（**書き直していない**こと・天気以外に触ったか）
4. **3つのページの応答（送る前・送った後）**
5. **配信 / sent.log の push** の成否
6. 失敗があれば**エラー出力の原文**とレポート全文
