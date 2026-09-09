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

# LINEのtextメッセージは1通5000文字まで。安全側で4500文字ごとに分割して送る。
text=$(cat "$1")
max=4500
total=${#text}
offset=0
part=0

while (( offset < total )); do
  chunk="${text:offset:max}"
  offset=$(( offset + max ))
  part=$(( part + 1 ))

  payload=$(jq -n --arg t "$chunk" '{messages: [{type: "text", text: $t}]}')

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
