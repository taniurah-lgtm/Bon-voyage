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
  # 🔴 family は左右の小さい2体を落とす（drop_x）。
  #   元のCanva素材の時点で崩れていて、**線にすると人に見えない。**
  #   左（x 8〜35）は顔と腕がくっついた塊、右（x163〜185）は体が台形で脚が線1本。
  #   色がついていたから見えていなかっただけ。中央の3人は x38〜151 で完全に分かれている。
  #   落としても位置は1mmも動かない（キャンバスの大きさは変えない）。
  'family.png':    ('ink',  {'thr':  70, 'speck': 2,          # 2 より大きいと顔の目が消える
                             'drop_x': [(0, 38), (151, 9999)]}),
  'balloon-a.png': ('ink',  {'thr': 120, 'speck': 3, 'one_tail': 0.58}),
  'balloon-b.png': ('ink',  {'thr': 120, 'speck': 3, 'one_tail': 0.62}),
  'tree.png':      ('ink',  {'thr':  95, 'speck': 3}),
  'sun.png':       ('ink',  {'thr': 120, 'speck': 2}),
  # 薄い紙吹雪は濃い線を持っていない（明るさ最小208）。輪郭だけ取る
  'petals-a.png':  ('sil',  {}),
  'petals-c.png':  ('sil',  {}),
  'petals-b.png':  ('ink',  {'thr': 150, 'speck': 1}),
  'hills.png':     ('edge', {'blur': 31, 'step':128}),   # にじみの粒が残るので強めに
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


def single_tail(mask, keep_x):
    """ぶら下がる紐が2本に分かれている絵で、下側の分岐を1本に減らす。

    ★風船の紐は、元の絵ではリボンで**2本**描かれている。
      色がついていれば束に見えるが、線画にすると「線が二重」に見えてしまう。
      （2026-09-19 オーナー指摘「風船の紐は1本線に」）

    🔴 行ごとに「keep_x に近いほう」を選ぶだけだと、2本が交差する段で
      選ぶ先が飛び、**紐が 切れ切れになる**（一度そうなった）。
      **前の行で選んだ位置から追いかける**こと。

    🔴 紐が**横向き**の絵（balloon-b）では、行で走査すると1行が紐まるごとになり、
      太い塊になる。**紐の外接矩形が横長なら、転置して列で走査する。**
    """
    ys = np.flatnonzero(mask.any(axis=1)); xs = np.flatnonzero(mask.any(axis=0))
    if ys.size and xs.size and (xs.max() - xs.min()) > (ys.max() - ys.min()):
        return single_tail(mask.T, float(ys.mean())).T

    out = np.zeros_like(mask)
    prev = keep_x
    for y in range(mask.shape[0]):
        idx = np.flatnonzero(mask[y])
        if idx.size == 0:
            continue
        runs, st = [], idx[0]
        for a, b in zip(idx, idx[1:]):
            if b != a + 1:
                runs.append((st, a)); st = b
        runs.append((st, idx[-1]))
        best = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - prev))
        out[y, best[0]:best[1] + 1] = 1
        prev = (best[0] + best[1]) / 2      # ← 次の行はここから探す
    return out


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
        if p.get('one_tail'):
            # 球の下端から下だけを対象にする（球の輪郭は2本に見えるので触らない）
            ys = np.flatnonzero(solid.any(axis=1))
            cut = int(ys.min() + (ys.max() - ys.min()) * p['one_tail'])
            cx = float(np.flatnonzero(solid[cut:].any(axis=0)).mean()) if solid[cut:].any() else e.shape[1] / 2
            t = single_tail(e[cut:], cx)
            # 追いかける途中で飛ぶと紐に隙間ができる。つないでおく
            # 🔴 つないだあとに元のマスクで AND すると、**橋渡しした画素ごと消える**。
            #   （一度それで隙間が残った。closing の結果をそのまま使う）
            t = cv2.morphologyEx(t, cv2.MORPH_CLOSE, np.ones((6 * UP, 6 * UP), np.uint8))
            e[cut:] = t
        # 🔴 ここで「塗りつぶされた面を中抜きして輪郭だけにする」ことを一度やったが、
        #   **腕・脚・風船の紐まで中抜きされて「管」になった**（2026-09-19）。
        #   子どもが人の形に見えなくなり、紐は二重線になった。
        #   中抜きはしない。代わりに**しきい値を下げて、塗りを拾わない**ようにする。
        #   （family は thr=96 だと父のズボンが黒く潰れる。70 なら線だけ残る）
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
        e = despeckle(e, 40)   # 水彩の粒を落とす。稜線だけ残ればよい

    for x0, x1 in p.get('drop_x', []):
        e[:, x0 * UP: x1 * UP] = 0

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
