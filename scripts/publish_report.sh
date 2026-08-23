#!/usr/bin/env bash
# 無料通信を「commit → push → LINE配信 → 送信検証」まで1コマンドで通す。
#
# なぜこれが要るか:
#   2026-07-22 / 07-29 / 08-05 / 08-12 の4回、「LINE配信は成功・pushだけ失敗」で
#   リポジトリに記録が残らなかった。手順書には書いてあったが守られなかったので、
#   手順ではなく**道具**にした。
#
# いちばん大事な性質: **push が通らないかぎり LINE を送らない。**
#   先に送ってしまうと、届いたのに記録が無い状態になり、あとから復元できない。
#
# 使い方: scripts/publish_report.sh reports/free/2026-08-26.md [--force]
set -uo pipefail

BRANCH="claude/family-event-planning-rfwmo8"
REPORT="${1:-}"
FORCE="${2:-}"

die(){ echo "ERROR: $*" >&2; exit 1; }
note(){ echo "  $*"; }

[[ -n "$REPORT" ]] || die "使い方: $0 <レポートファイル> [--force]"
[[ -f "$REPORT" ]] || die "ファイルがありません: $REPORT"
[[ -s "$REPORT" ]] || die "ファイルが空です: $REPORT"

echo "▶ 1/5 事前検査"

# 下書きの指示書き・内部ラベルが本文に混ざっていないか。
# line_report.sh はファイル全文をそのまま送るので、混入は事故に直結する。
LEAK=$(grep -nE '決めてあげる|配信前にやること|区切り線より下|版下|^# 【下書き】|ここまで指示|TODO' "$REPORT" || true)
if [[ -n "$LEAK" ]]; then
  echo "$LEAK" >&2
  die "本文に指示書き/内部ラベルが混ざっています。取り除いてから再実行してください。"
fi

CHARS=$(wc -m < "$REPORT" | tr -d ' ')
note "文字数: ${CHARS}(1通4500字で分割されます)"

echo "▶ 2/5 LINE無料枠の確認"
if [[ -z "${LINE_CHANNEL_ACCESS_TOKEN:-}" ]]; then
  die "LINE_CHANNEL_ACCESS_TOKEN が未設定です。"
fi
AUTH="Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}"
QUOTA=$(curl -sS -m 20 -H "$AUTH" https://api.line.me/v2/bot/message/quota 2>/dev/null)
USED=$(curl -sS -m 20 -H "$AUTH" https://api.line.me/v2/bot/message/quota/consumption 2>/dev/null \
       | grep -oE '[0-9]+' | head -1)
YDAY=$(TZ=Asia/Tokyo date -d yesterday +%Y%m%d)
REACH=$(curl -sS -m 20 -H "$AUTH" "https://api.line.me/v2/bot/insight/followers?date=${YDAY}" 2>/dev/null \
        | grep -oE '"targetedReaches"[^0-9]*[0-9]+' | grep -oE '[0-9]+$')
LIMIT=$(echo "$QUOTA" | grep -oE '"value"[^0-9]*[0-9]+' | grep -oE '[0-9]+$')

note "プラン上限: ${LIMIT:-不明} / 今月の消費: ${USED:-不明} / 到達者数: ${REACH:-不明}"
if [[ -n "${LIMIT:-}" && -n "${USED:-}" && -n "${REACH:-}" ]]; then
  AFTER=$(( USED + REACH ))
  note "送信すると ${AFTER} 通になります"
  if (( AFTER > LIMIT )); then
    if [[ "$FORCE" != "--force" ]]; then
      die "無料枠を超えます(${AFTER} > ${LIMIT})。プランを見直すか、承知のうえなら --force を付けてください。"
    fi
    note "⚠️ 枠を超えますが --force のため続行します"
  fi
fi

echo "▶ 3/5 commit"
git add -A
if git diff --cached --quiet; then
  note "変更なし(既にコミット済み)"
else
  git commit -q -m "$(basename "$REPORT" .md) 号を配信" || die "commit に失敗しました"
  note "コミットしました"
fi

echo "▶ 4/5 push(通らなければ配信しない)"
PUSH_OK=0
for i in 1 2 3 4; do
  OUT=$(git push -u origin "$BRANCH" 2>&1)
  if [[ $? -eq 0 ]]; then PUSH_OK=1; note "push 成功(${i}回目)"; break; fi
  echo "$OUT" >&2
  if echo "$OUT" | grep -qiE 'non-fast-forward|fetch first|rejected'; then
    note "非fast-forward。pull --rebase して再試行します(SNS草案が毎朝同じブランチに入るため)"
    git pull --rebase origin "$BRANCH" >/dev/null 2>&1 || die "rebase に失敗しました。手動で解決してください。"
  else
    SLEEP=$(( 2 ** i ))
    note "ネットワーク起因の可能性。${SLEEP}秒待って再試行します"
    sleep "$SLEEP"
  fi
done

if (( PUSH_OK == 0 )); then
  echo
  echo "════════ push に失敗しました。LINEは送っていません ════════" >&2
  echo "このセッションは一時的な環境なので、コミットは失われます。" >&2
  echo "下のレポート全文を保存し、次のセッションで再投入してください。" >&2
  echo "──────── レポート全文 ────────" >&2
  cat "$REPORT" >&2
  echo "──────── ここまで ────────" >&2
  exit 1
fi

echo "▶ 5/5 LINE配信と送信検証"
if ! bash scripts/line_report.sh "$REPORT"; then
  echo "ERROR: LINE送信に失敗しました。pushは済んでいるので、レポートは残っています。" >&2
  exit 3
fi

TODAY=$(TZ=Asia/Tokyo date +%Y%m%d)
sleep 3
SENT=$(curl -sS -m 20 -H "$AUTH" "https://api.line.me/v2/bot/insight/message/delivery?date=${TODAY}" 2>/dev/null)
note "LINE側の送信記録(${TODAY}): ${SENT}"

echo
echo "✅ 完了: push・配信ともに成功しました"
echo "   レポート : $REPORT"
echo "   コミット : $(git rev-parse --short HEAD)"
