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
echo "── sitemap.xml"
node scripts/build-sitemap.mjs

echo
echo "── トップページの「投稿できます」を実装に合わせる"
node scripts/apply-post-mode.mjs docs/homepage/index.html

echo
echo "── 会員ページ（全件のカレンダー＋地図）"
node scripts/build-members.mjs

echo
if [ "${MEMBER_PASS:-}" = "" ]; then
  echo "⚠ MEMBER_PASS が未設定。合言葉は 'CHANGEME' で組まれているので、このまま公開しないこと。"
fi
if [ "${MAP_POST_URL:-}" = "" ]; then
  echo "⚠ MAP_POST_URL が未設定。投稿はサイト内フォームではなく「LINEでお預かり」の案内になる。"
fi

# 検証用の合言葉で組まれたものが残っていないか（公開前の最後の砦）
if grep -rl "BV_BUILD: TEST_PASSPHRASE" docs/homepage/ >/dev/null 2>&1; then
  echo
  echo "🔴 検証用の合言葉で組まれたページが残っている。このまま公開しないこと:"
  grep -rl "BV_BUILD: TEST_PASSPHRASE" docs/homepage/ | sed "s/^/     /"
  echo "     → MEMBER_PASS='本物の合言葉' ./scripts/build-site.sh で組み直す"
  exit 1
fi
echo "✓ 合言葉は本物で組まれている"
