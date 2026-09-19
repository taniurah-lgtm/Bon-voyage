#!/usr/bin/env python3
"""
カラーのイラストを「白抜き（線画）」に変える。白黒版のチラシ用。

  python3 scripts/make-art-outline.py

docs/homepage/assets/art/canva/*.png  →  docs/homepage/assets/art/canva-bw/*.png

★なぜ線画にするか
  塗りのまま白黒にすると、丘も家族も木も**灰色の塊**になる。
  A4の下半分が全部グレーになってトナーを食い、輪郭も分からない。
  線画にすると、形が残ってトナーはほとんど使わない。

★2026-09-19 作り直した。最初は「色の境目」を全部線にしていたが、
  服の水彩のにじみまで線になって、家族が**墨だらけ**になった。

  この絵は**もともと濃い線で描かれている。**明るさの分布を見ると:

      balloon-a  10%=48 → 20%=197   線と塗りがはっきり分かれる
      sun         5%=60 → 10%=169
      family     10%=49 → 20%= 71   線＋濃い服
      hills       2%=132            ← 濃い線が無い（水彩のにじみだけ）

  だから **描いてある線そのものを、明るさで抜く**のが正しい（ink）。
  丘だけは線が無いので、ならしてから輪郭を取る（edge）。
"""
import os, glob
import numpy as np
from PIL import Image
import cv2

SRC = 'docs/homepage/assets/art/canva'
DST = 'docs/homepage/assets/art/canva-bw'
UP  = 4            # 先に4倍にしてから線を取る（素材が小さく、紙では2200pxまで伸びる）
LINE = (30, 30, 30)

# ink  … 描いてある線を明るさで抜く。thr=しきい値 / speck=これより小さい粒は消す（元画素で）
# edge … 線が無い絵。ならしてから色の境目を取る。blur=ならしの強さ / step=量子化の粗さ
ART = {
  'family.png':    ('ink',  {'thr':  96, 'speck': 5}),
  'balloon-a.png': ('ink',  {'thr': 120, 'speck': 3}),
  'balloon-b.png': ('ink',  {'thr': 120, 'speck': 3}),
  'tree.png':      ('ink',  {'thr':  95, 'speck': 3}),
  'sun.png':       ('ink',  {'thr': 120, 'speck': 2}),
  # 薄い紙吹雪は濃い線を持っていない（明るさ最小208）。輪郭だけ取る
  'petals-a.png':  ('sil',  {}),
  'petals-c.png':  ('sil',  {}),
  'petals-b.png':  ('ink',  {'thr': 150, 'speck': 1}),
  'hills.png':     ('edge', {'blur': 21, 'step': 96}),
}
DEFAULT = ('ink', {'thr': 110, 'speck': 3})


def despeckle(mask, min_px):
    """小さい粒を消す。服の水彩のにじみが点々になって残るのを落とす。"""
    if min_px <= 1: return mask
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_px * UP * UP:
            keep[lab == i] = 1
    return keep


def build(path):
    name = os.path.basename(path)
    mode, p = ART.get(name, DEFAULT)
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    im = im.resize((w * UP, h * UP), Image.LANCZOS)
    arr = np.array(im)
    rgb, a = arr[..., :3], arr[..., 3]
    solid = (a > 128).astype(np.uint8)
    L = np.array(Image.fromarray(rgb).convert('L'))
    k = np.ones((3, 3), np.uint8)

    if mode == 'ink':
        # ★描いてある線だけだと、濃い線を持たない淡い形（風船の球・太陽の光・木の葉）が
        #   まるごと消える。**透明との境目（輪郭）も必ず足す。**
        e = ((L < p['thr']) & (solid > 0)).astype(np.uint8)
        e |= cv2.morphologyEx(solid, cv2.MORPH_GRADIENT, np.ones((UP, UP), np.uint8))
        e = despeckle(e, p['speck'])
        # 塗りつぶされた面（濃い服・濃い髪）は、中を抜いて輪郭だけにする。
        # そうしないと真っ黒な塊が残る。
        big = cv2.morphologyEx(e, cv2.MORPH_OPEN, np.ones((5 * UP // 2, 5 * UP // 2), np.uint8))
        e = (e & ~big) | cv2.morphologyEx(big, cv2.MORPH_GRADIENT, np.ones((UP, UP), np.uint8))
        e = despeckle(e, max(1, p['speck'] // 2))
    elif mode == 'sil':
        # 濃い線が無い絵。透明との境目だけを線にする
        e = cv2.morphologyEx(solid, cv2.MORPH_GRADIENT, np.ones((UP, UP), np.uint8))
    else:
        sm = cv2.medianBlur(rgb, p['blur'])
        q = (sm.astype(np.int32) // p['step'])
        lab = q[..., 0] * 10000 + q[..., 1] * 100 + q[..., 2]
        d = np.zeros_like(solid)
        d[:, :-1] |= (lab[:, :-1] != lab[:, 1:]).astype(np.uint8)
        d[:-1, :] |= (lab[:-1, :] != lab[1:, :]).astype(np.uint8)
        e = (d & cv2.erode(solid, k, iterations=2)) | cv2.morphologyEx(solid, cv2.MORPH_GRADIENT, k)
        e = despeckle(e, 4)

    e = (e > 0).astype(np.uint8) * 255
    e = cv2.GaussianBlur(e, (3, 3), 0)
    out = np.zeros((*e.shape, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = LINE
    out[..., 3] = e
    return Image.fromarray(out, 'RGBA'), mode


os.makedirs(DST, exist_ok=True)
for f in sorted(glob.glob(f'{SRC}/*.png')):
    img, mode = build(f)
    n = os.path.basename(f)
    img.save(f'{DST}/{n}')
    ink = (np.array(img)[..., 3] > 0).mean() * 100
    print(f'  {n:16} {mode:4} {img.size[0]:4}x{img.size[1]:<4} 線の面積 {ink:4.1f}%')
