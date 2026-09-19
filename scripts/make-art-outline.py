#!/usr/bin/env python3
"""
カラーのイラストを「白抜き（線画）」に変える。白黒版のチラシ用。

  python3 scripts/make-art-outline.py

docs/homepage/assets/art/canva/*.png  →  docs/homepage/assets/art/canva-bw/*.png

★なぜ線画にするか
  塗りのまま白黒にすると、丘も家族も木も**灰色の塊**になる。
  A4の下半分が全部グレーになってトナーを食い、輪郭も分からない。
  線画にすると、形が残ってトナーはほとんど使わない。

★なぜ色の境目を拾うか（Canny ではなく）
  この絵は平らな色で塗られた図。輝度のエッジ検出だと、
  似た明るさの隣り合う色（葉の緑と草の緑など）で線が切れる。
  **色を量子化してラベルにし、ラベルが変わるところを線にする**ほうが確実。

★なぜ先に拡大するか
  素材は 72〜800px と小さいのに、紙では 188mm（=300dpiで2200px）まで伸びる。
  元の大きさで線を取ると、印刷でガタガタになる。
"""
import os, glob
import numpy as np
from PIL import Image
import cv2

SRC = 'docs/homepage/assets/art/canva'
DST = 'docs/homepage/assets/art/canva-bw'
UP  = 4          # 先に4倍にしてから線を取る
LINE = (30, 30, 30)

# ★絵によって前処理を変える。
#   水彩のにじみがある絵（丘）は、色の境目をそのまま拾うと**しみを全部線にしてしまう**。
#   先に強くならして、粗い量子化にする。形だけ残ればよい。
SMOOTH = {            # ファイル名 → (ならしの強さ, 量子化の粗さ)
  'hills.png': (21, 96),
  'default':  ( 0, 40),
}

def outline(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    im = im.resize((w * UP, h * UP), Image.LANCZOS)
    arr = np.array(im)
    rgb, a = arr[..., :3].astype(np.int16), arr[..., 3]

    blur, step = SMOOTH.get(os.path.basename(path), SMOOTH['default'])
    if blur:
        rgb = cv2.medianBlur(rgb.astype(np.uint8), blur).astype(np.int16)

    solid = (a > 128).astype(np.uint8)
    k = np.ones((3, 3), np.uint8)

    # ① 外側の輪郭（透明との境目）
    edge_a = cv2.morphologyEx(solid, cv2.MORPH_GRADIENT, k)

    # ② 内側の線（色が変わるところ）。色を粗く量子化してラベル化する
    q = (rgb // step).astype(np.int32)
    lab = q[..., 0] * 10000 + q[..., 1] * 100 + q[..., 2]
    d = np.zeros_like(solid)
    d[:, :-1] |= (lab[:, :-1] != lab[:, 1:]).astype(np.uint8)   # 横
    d[:-1, :] |= (lab[:-1, :] != lab[1:, :]).astype(np.uint8)   # 縦
    edge_i = (d & solid)
    # 透明のふちで拾う偽の線を落とす
    edge_i &= cv2.erode(solid, k, iterations=2)

    e = ((edge_a | edge_i) > 0).astype(np.uint8) * 255
    # 線を少し太らせて、細りすぎを防ぐ（紙で消えないように）
    e = cv2.dilate(e, np.ones((2, 2), np.uint8), iterations=1)
    e = cv2.GaussianBlur(e, (3, 3), 0)

    out = np.zeros((e.shape[0], e.shape[1], 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = LINE
    out[..., 3] = e
    return Image.fromarray(out, 'RGBA')

os.makedirs(DST, exist_ok=True)
for f in sorted(glob.glob(f'{SRC}/*.png')):
    n = os.path.basename(f)
    img = outline(f)
    img.save(f'{DST}/{n}')
    ink = (np.array(img)[..., 3] > 0).mean() * 100
    print(f'  {n:16} {img.size[0]}x{img.size[1]}  線の占める面積 {ink:4.1f}%')
