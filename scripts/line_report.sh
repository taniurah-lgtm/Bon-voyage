#!/usr/bin/env bash
# LINE公式アカウント(Messaging API)の broadcast でレポートを送信する。
# 使い方: scripts/line_report.sh reports/2026-07-08.md
# 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN (docs/line-setup.md 参照)
set -euo pipefail

if [[ -z "${LINE_CHANNEL_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: LINE_CHANNEL_ACCESS_TOKEN が未設定です。docs/line-setup.md の手順で設定してください。" >&2
  echo "フォールバック: レポートをチャットで届けてください。" >&2
  exit 1
fi

if [[ $# -lt 1 || ! -f "$1" ]]; then
  echo "使い方: $0 <レポートファイル>" >&2
  exit 2
fi

# LINEのtextメッセージは1通5000文字まで。安全側で4500「文字」ごとに分割する。
#
# 🔴 2026-09-16 の事故: ここを bash の ${text:offset:max} でやっていた。
#    この箱は LANG が未設定で、bash は文字列をバイトとして扱う。
#    ・2,034文字（＝1通で収まる）の号が 5,035バイトと数えられ、2通に分割された
#    ・しかも切れ目がマルチバイトの途中で、「バル�」「�ンなど」と文字が壊れた
#    → 分割は python3 に任せる。必ず文字単位で数え、行の切れ目で割る。
mapfile -t CHUNK_FILES < <(python3 - "$1" <<'PYEOF'
import sys, tempfile
MAX = 4500                     # LINEの上限は5000文字。安全側で4500
text = open(sys.argv[1], encoding='utf-8').read()

# 🔴 2026-09-22 に見つかった穴: 下書きの指示ブロックが <!-- --> で書かれていて、
#    ここはファイル全文をそのまま送っていた。9/23号には
#    台帳ID・巡回の仕組み・スクリプト名・先方とのやりとりが入ったまま残っており、
#    そのまま読者76人へ流れるところだった（CLAUDE.md「🔒 公開物に書かないこと」）。
#    publish_report.sh の事前検査も、この書き方は拾えていなかった。
#    → **送る直前に、HTMLコメントを必ず落とす。**
import re
text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
text = re.sub(r'\n{3,}', '\n\n', text).strip('\n')

# 行の切れ目で割る。1行がMAXを超えることはまず無いが、超えたらその行だけ文字で割る。
parts, cur = [], ''
for line in text.split('\n'):
    while len(line) > MAX:
        if cur: parts.append(cur); cur = ''
        parts.append(line[:MAX]); line = line[MAX:]
    if len(cur) + len(line) + 1 > MAX:
        parts.append(cur); cur = line
    else:
        cur = line if not cur else cur + '\n' + line
if cur: parts.append(cur)

for p in parts:
    f = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8')
    f.write(p); f.close()
    print(f.name)
PYEOF
)

echo "（${#CHUNK_FILES[@]}通に分けて送ります）"

# ★2026-10-21: 本文の前に画像を1枚はさめるようにした（オーナーと奥さまの案）。
#   年齢別ページへのリンクが2割しか押されていない → 流し読みでも「リンクの先にページがある」と分かる絵を先に出す。
#   号のファイルに  <!-- line-image: https://bonvoya.nicomaru.tokyo/assets/line/<名前>.jpg -->  と書くと、
#   **1通目と同じ配信（同じリクエスト）**で、画像 → 本文 の順に届く。1回の配信なので通数は増えない。
#   プレビュー画像は <名前>-preview.jpg（1MB未満）。scripts/make-line-image.mjs が両方を書き出す。
#   🔴 画像が開けない・LINEの事前検査に通らないときは、**画像を外して本文だけ送る**（画像のせいで号が届かない、を起こさない）
IMG_URL=$(python3 - "$1" <<'PYEOF'
import re, sys
t = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'<!--\s*line-image:\s*(https://\S+?\.(?:jpe?g|png))\s*-->', t)
print(m.group(1) if m else '')
PYEOF
)
IMG_PREV=""
# 🔴 この区間は set -e の下にある。確認が失敗しても**配信そのものは止めない**よう、どのコマンドも || で受ける
if [[ -n "$IMG_URL" ]]; then
  IMG_PREV="${IMG_URL%.*}-preview.${IMG_URL##*.}"
  img_ok=1
  for u in "$IMG_URL" "$IMG_PREV"; do
    info=$(curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}' -m 30 "$u" 2>/dev/null || echo "000 - 0")
    read -r code ctype size <<< "$info" || true
    lim=10000000; [[ "$u" == "$IMG_PREV" ]] && lim=1000000
    if [[ "$code" != "200" || "$ctype" != image/* || ! "$size" =~ ^[0-9]+$ || "$size" -eq 0 || "$size" -gt "$lim" ]]; then
      echo "WARN: 画像が使えません（$u → $info）。画像を外して本文だけ送ります。" >&2
      img_ok=0
    fi
  done
  if (( img_ok == 1 )); then
    vpayload=$(jq -n --arg o "$IMG_URL" --arg p "$IMG_PREV" --rawfile t "${CHUNK_FILES[0]}" \
      '{messages: [{type:"image", originalContentUrl:$o, previewImageUrl:$p}, {type:"text", text:$t}]}' 2>/dev/null || echo "")
    vcode=$(curl -sS -o /tmp/line_validate.json -w '%{http_code}' -m 20 \
      -X POST https://api.line.me/v2/bot/message/validate/broadcast \
      -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" -H 'Content-Type: application/json' -d "$vpayload" 2>/dev/null || echo "000")
    if [[ -z "$vpayload" || "$vcode" != "200" ]]; then
      echo "WARN: LINEの事前検査に通りませんでした（HTTP $vcode）。画像を外して本文だけ送ります:" >&2
      cat /tmp/line_validate.json >&2 2>/dev/null || true; echo >&2
      img_ok=0
    fi
  fi
  if (( img_ok == 1 )); then echo "（1通目の前に画像を1枚はさみます: $IMG_URL）"; else IMG_URL=""; fi
fi

part=0
for cf in "${CHUNK_FILES[@]}"; do
  part=$(( part + 1 ))
  if (( part == 1 )) && [[ -n "$IMG_URL" ]]; then
    payload=$(jq -n --arg o "$IMG_URL" --arg p "$IMG_PREV" --rawfile t "$cf" \
      '{messages: [{type:"image", originalContentUrl:$o, previewImageUrl:$p}, {type:"text", text:$t}]}')
  else
    payload=$(jq -n --rawfile t "$cf" '{messages: [{type: "text", text: $t}]}')
  fi
  rm -f "$cf"

  http_code=$(curl -sS -o /tmp/line_resp.json -w '%{http_code}' \
    -X POST https://api.line.me/v2/bot/message/broadcast \
    -H "Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "$payload")

  if [[ "$http_code" != "200" ]]; then
    echo "ERROR: LINE送信に失敗しました (HTTP $http_code, part $part):" >&2
    cat /tmp/line_resp.json >&2
    exit 3
  fi
  echo "OK: part $part を送信しました"
done

echo "完了: $1 をLINEにブロードキャストしました"

# ★送信できたときだけ、配信の記録を1行足す。
#   ホームページの「最新号のプレビュー」はこの記録を見て出すので、
#   ここに載るまでサイトには出ない＝読者がいちばん先に受け取る、が守られる。
#   （2026-09-09、下書きを置いた時点でサイトが1時間先行していた。その順番を機械に守らせる）
sent_log="reports/free/sent.log"
if [[ -f "$sent_log" ]]; then
  issue_date=$(basename "$1" .md)
  if grep -qF "	$1	" "$sent_log"; then
    echo "（$1 はすでに配信の記録があります。追記しません）"
  else
    printf '%s\t%s\t%s\n' "$issue_date" "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$sent_log"
    echo "配信の記録を $sent_log に追記しました。"
    echo "→ この1行を rfwmo8 に push すると、ホームページのプレビューが今の号に切り替わります。"
  fi
else
  echo "WARN: $sent_log がありません。ホームページのプレビューは切り替わりません。" >&2
fi
