#!/usr/bin/env bash
# チラシ・ポスターの版下に使う書体をそろえる。
#   bash scripts/setup-fonts.sh
#
# ★この箱には IPAゴシック しか入っていない。それだけで刷ると、
#   Canva版と並べたときにはっきり見劣りする（2026-09-15 に実際そうなった）。
#
# ★2026-09-16: Canva版のPDFから、向こうが使っている書体が分かった。
#     ブランド名「ぼんぼやーじゅ通信」… 07TetsubinGothic（07鉄瓶ゴシック）
#     それ以外の文字ぜんぶ　　　　　　… Canva_LyraStd-DB
#   Canva_LyraStd は Canva の中でしか使えない専用書体なので、外の版下には使えない。
#   そこで、印象の近い無料書体（SIL OFL・商用可・PDF埋め込み可）に置き換えた。
#     Mochiy Pop One  … ブランド名。07鉄瓶ゴシックと同じ「太い丸ゴシック」
#     Zen Kurenaido   … 見出し・リード。Lyra と同じ「手書きの柔らかさ」。太さは1つだけ
#     Zen Maru Gothic … 小さい本文・注記。読みやすさ優先。太さが4段ある
set -euo pipefail
DEST="${HOME}/.fonts"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
mkdir -p "$DEST"

get() { # get <ofl配下のパス>
  local n; n="$(basename "$1")"
  [ -f "$DEST/$n" ] && { echo "  $n（すでにある）"; return; }
  curl -sSfL -o "$DEST/$n" "$BASE/$1"
  echo "  $n  $(du -h "$DEST/$n" | cut -f1)"
}

for f in Regular Medium Bold Black; do get "zenmarugothic/ZenMaruGothic-${f}.ttf"; done
get "zenkurenaido/ZenKurenaido-Regular.ttf"
get "mochiypopone/MochiyPopOne-Regular.ttf"

fc-cache -f >/dev/null 2>&1 || true
echo
ok=1
for fam in "Zen Maru Gothic" "Zen Kurenaido" "Mochiy Pop One"; do
     if fc-list : family | tr ',' '\n' | grep -qxi "$fam"; then
    echo "  ⭕️ $fam"
  else
    echo "  🔴 $fam が入っていない"; ok=0
  fi
done
[ "$ok" = 1 ] || { echo "🔴 版下は IPAゴシック で出る。刷らないこと。"; exit 1; }
echo
echo "★版下は @font-face ではなく書体名で参照している。この箱に入っていないと静かに落ちる。"
