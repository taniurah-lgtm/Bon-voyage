#!/usr/bin/env bash
# チラシ・ポスターの版下に使う書体をそろえる。
#   bash scripts/setup-fonts.sh
#
# ★この箱には IPAゴシック しか入っていない。それだけで刷ると、
#   Canva版と並べたときにはっきり見劣りする（2026-09-15 に実際そうなった）。
#
# 入れるのは Zen Maru Gothic（SIL OFL / 商用可・PDF埋め込み可）。
# Canva版の丸ゴシックに近く、字面が素直で、太さが4段ある。
# 3.7MB×4＝15MB あるのでリポジトリには入れない。ここで取ってくる。
set -euo pipefail
DEST="${HOME}/.fonts"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic"
mkdir -p "$DEST"
for f in Regular Medium Bold Black; do
  n="ZenMaruGothic-${f}.ttf"
  [ -f "$DEST/$n" ] && { echo "  $n（すでにある）"; continue; }
  curl -sSL -o "$DEST/$n" "$BASE/$n"
  echo "  $n  $(du -h "$DEST/$n" | cut -f1)"
done
fc-cache -f >/dev/null 2>&1 || true
echo
fc-list :lang=ja family | tr ',' '\n' | grep -i "^Zen Maru" | sort -u || {
  echo "🔴 入っていない。版下は IPAゴシック で出る。"; exit 1; }
echo "★版下の @font-face ではなく、フォント名で参照している。この箱に入っていないと落ちる。"
