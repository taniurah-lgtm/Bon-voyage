#!/usr/bin/env bash
# ホームページ一式を作り直す。
#   MEMBER_PASS=xxx [MAP_POST_URL=...] ./scripts/build-site.sh
#
# 台帳(events/*.md) → data/events.json → 公開カレンダー / 会員ページ
# スポット(data/map-spots.json) → 公開マップ / 会員ページの地図
#
# ★台帳は rfwmo8 ブランチが正。中身が古いと感じたら先に:
#     git checkout origin/claude/family-event-planning-rfwmo8 -- events/
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 台帳を読む"
node scripts/build-events-json.mjs

echo
echo "── 公開カレンダー（誰でも・先2週間）"
node scripts/build-calendar.mjs

echo
echo "── 公開マップ（地図＋投稿フォーム）"
node scripts/build-map.mjs

echo
echo "── 会員ページ（全件のカレンダー＋地図）"
node scripts/build-members.mjs

echo
if [ "${MEMBER_PASS:-}" = "" ]; then
  echo "⚠ MEMBER_PASS が未設定。合言葉は 'CHANGEME' で組まれているので、このまま公開しないこと。"
fi
if [ "${MAP_POST_URL:-}" = "" ]; then
  echo "⚠ MAP_POST_URL が未設定。投稿フォームは出るが、送信するとコピー案内に切り替わる。"
fi
