#!/usr/bin/env python3
"""白地に黒線で描かれた家族の絵を、チラシに重ねられる透過PNGにする。

  python3 scripts/make-stick-family.py

入力  docs/homepage/assets/art/src/family-stick.jpg  （オーナー提供・白地に黒線）
出力  docs/homepage/assets/art/canva-bw/family-stick.png

やっていること:
  - 明るさをそのまま不透明度にする（alpha = 255 - 明るさ）。
    2値化しないので**線の端のギザギザが出ない**。紙の上では 0.4mm 前後の線になる。
  - 線の色は、ほかの線画とそろえて #1E1E1E。真っ黒にするとこの絵だけ浮く。
  - 余白を切り落とす（絵の位置をCSSで決めるので、余白があると合わせられない）。
  - 🔴 白い部分は「紙の色」であって白インクではない。**クラフト紙に刷ると紙の色が出る。**
    だから塗りつぶさず、透過のまま置く。
"""
import cv2, numpy as np, os

SRC = 'docs/homepage/assets/art/src/family-stick.jpg'
DST = 'docs/homepage/assets/art/canva-bw/family-stick.png'
LINE = (30, 30, 30)          # #1E1E1E。ほかの線画と同じ
PAD  = 4                     # 切り落としたあとに残す余白(px)。線の端が欠けないように

img = cv2.imread(SRC)
if img is None:
    raise SystemExit(f'読めません: {SRC}')
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

alpha = (255 - g.astype(np.int16)).clip(0, 255).astype(np.uint8)
alpha[alpha < 8] = 0         # 紙のわずかな汚れを落とす（JPEGなので真っ白にはならない）

ys, xs = np.where(alpha > 0)
if not len(xs):
    raise SystemExit('線が見つかりません')
x0, x1 = max(0, xs.min() - PAD), min(alpha.shape[1], xs.max() + 1 + PAD)
y0, y1 = max(0, ys.min() - PAD), min(alpha.shape[0], ys.max() + 1 + PAD)
alpha = alpha[y0:y1, x0:x1]

out = np.zeros((alpha.shape[0], alpha.shape[1], 4), np.uint8)
out[..., 0], out[..., 1], out[..., 2] = LINE[2], LINE[1], LINE[0]   # BGRA
out[..., 3] = alpha

os.makedirs(os.path.dirname(DST), exist_ok=True)
cv2.imwrite(DST, out)
print(f'wrote {DST}  {alpha.shape[1]}x{alpha.shape[0]}  '
      f'（縦/横 = {alpha.shape[0]/alpha.shape[1]:.3f}）')
