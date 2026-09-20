#!/usr/bin/env python3
"""棒人間の家族に、カラー版チラシの色を塗る。

  python3 scripts/make-stick-family-color.py

入力  docs/homepage/assets/art/canva-bw/stick-*.png （線画・#1E1E1E）
出力  docs/homepage/assets/art/canva/stick-*-color.png

やり方:
  1. 線で囲まれた「内側の面」を、塗りつぶしではなく**連結成分**で見つける。
     透明な部分をラベリングして、**画像の外周に触れていない塊＝閉じた内側**。
     顔・服・手のわっか・靴の中が、それぞれ別の塊になる。
  2. 面積の大きい順に2つ取り、**上にあるほうを顔（塗らない）**、
     **もう一方を服**として色を置く。棒人間は頭が円、胴が楕円なので、これで足りる。
  3. 🔴 **線の色を #1E1E1E から #374949 に替える。**
     カラー版の絵の輪郭がこの色で描かれているので、**黒のままだとこの家族だけ浮く。**
     （色はカラー版 family.png から k-means で拾った実測値）
"""
import cv2, numpy as np, os

SRC = 'docs/homepage/assets/art/canva-bw'
DST = 'docs/homepage/assets/art/canva'
LINE = (0x37, 0x49, 0x49)          # カラー版の輪郭と同じ色（実測）
CLOTHES = {                        # 服の色。すべてカラー版 family.png からの実測値
    'dad':  (0x9F, 0x7E, 0x60),    # 茶（元のお父さんのシャツと同じ）
    'mom':  (0x30, 0x78, 0x84),    # 青緑（元のお母さんのトップスと同じ）
    'boy':  (0xDF, 0xAC, 0x6D),    # 山吹（元のお母さんのスカートと同じ）
    'girl': (0xC3, 0xD1, 0xD2),    # 淡い水色（元の女の子のスカートと同じ）
    'baby': (0xDF, 0xAC, 0x6D),    # 山吹
}
SKIN = (0xFF, 0xFD, 0xF7)          # 紙の色。顔は塗らない＝紙のまま

os.makedirs(DST, exist_ok=True)
for name, clothes in CLOTHES.items():
    p = f'{SRC}/stick-{name}.png'
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise SystemExit(f'読めません: {p}')
    h, w = im.shape[:2]
    ink = im[..., 3] > 128

    # 線で囲まれた内側を探す。外周に触れている塊は「外」なので除く
    n, lab = cv2.connectedComponents((~ink).astype(np.uint8), 4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    inside = [(int((lab == i).sum()), i) for i in range(1, n) if i not in border]
    inside.sort(reverse=True)

    out = im.copy()
    if len(inside) >= 2:
        # 上にあるほうが顔。もう一方が服
        cand = inside[:2]
        tops = {i: np.where(lab == i)[0].min() for _, i in cand}
        face_i = min(tops, key=tops.get)
        body_i = [i for _, i in cand if i != face_i][0]
        for i, col in ((face_i, SKIN), (body_i, clothes)):
            m = lab == i
            out[m] = (col[2], col[1], col[0], 255)      # BGRA
        print(f'  stick-{name}-color.png  顔 {inside[0][0]}px / 服 {inside[1][0]}px')
    else:
        print(f'  ⚠️ stick-{name}: 閉じた面が {len(inside)} 個しか無く、服を塗れませんでした')

    # 線の色を、カラー版の輪郭の色に替える
    line = ink
    out[line, 0], out[line, 1], out[line, 2] = LINE[2], LINE[1], LINE[0]
    cv2.imwrite(f'{DST}/stick-{name}-color.png', out)
