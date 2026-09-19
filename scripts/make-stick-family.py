#!/usr/bin/env python3
"""白地に黒線で描かれた家族の絵を、チラシに重ねられる透過PNGにする。

  python3 scripts/make-stick-family.py

入力  docs/homepage/assets/art/src/family-stick.jpg  （オーナー提供・白地に黒線）
出力  docs/homepage/assets/art/canva-bw/stick-{dad,mom,baby,boy,girl}.png

やっていること:
  1. 明るさをそのまま不透明度にする（alpha = 255 - 明るさ）。
     2値化しないので**線の端のギザギザが出ない**。線の色は #1E1E1E で、
     ほかの線画とそろえてある（真っ黒にするとこの絵だけ浮く）。
  2. 🔴 **人ひとりずつ別のPNGに切り出す。**1枚の絵のままだと全員が同じ高さに
     並ぶので、丘の稜線（左右で7mmも上下する）の上に乗せられない。
     CSS側で1人ずつ稜線の高さに置いている（flyer-a4-canva-bw.html）。
  3. 目・手・髪といった小さな部品は、**いちばん近い人**に付ける。
     赤ちゃんの顔はお母さんの外枠の中にも入るので、枠の内外では判定できない。
  4. 犬・猫・右の大人2人は**出力しない**（2026-09-19・オーナー指示）。

  ⚠️ 白い部分は「紙の色」であって白インクではない。**クラフト紙に刷ると紙の色が出る。**
     だから塗りつぶさず、透過のまま置く。
"""
import cv2, numpy as np, os, json

SRC = 'docs/homepage/assets/art/src/family-stick.jpg'
DST = 'docs/homepage/assets/art/canva-bw'
LINE = (30, 30, 30)          # #1E1E1E。ほかの線画と同じ
PAD  = 3                     # 切り出したあとに残す余白(px)
BIG  = 3000                  # これより大きい塊を「1人ぶんの体」とみなす

# 体の塊を、元の絵での左からの順番で呼び分ける。
# 使わないものは None。x の昇順に並べたときの位置で決める。
ORDER = ['dad', None, 'mom', 'baby', 'boy', 'girl', None, None, None]
#          父   犬    母    赤ちゃん 男の子 女の子  祖母  猫   もう1人

img = cv2.imread(SRC)
if img is None:
    raise SystemExit(f'読めません: {SRC}')
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
alpha = (255 - g.astype(np.int16)).clip(0, 255).astype(np.uint8)
alpha[alpha < 8] = 0         # JPEGなので紙は真っ白にならない。わずかな汚れを落とす

mask = (alpha > 32).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
comps = [(stats[i, cv2.CC_STAT_LEFT], i, stats[i, cv2.CC_STAT_AREA]) for i in range(1, n)]
bigs  = sorted([(x, i) for x, i, a in comps if a >= BIG])
small = [i for x, i, a in comps if a < BIG and a >= 20]
if len(bigs) != len(ORDER):
    raise SystemExit(f'体の塊が {len(bigs)} 個。ORDER は {len(ORDER)} 個を想定しています')

# 小さい部品を、いちばん近い体に付ける（距離で決める。枠の内外では決められない）
dist = []
for _, i in bigs:
    dist.append(cv2.distanceTransform((lab != i).astype(np.uint8), cv2.DIST_L2, 3))
member = {k: [i] for k, (_, i) in enumerate(bigs)}
for s in small:
    px = (lab == s)
    member[int(np.argmin([d[px].min() for d in dist]))].append(s)

os.makedirs(DST, exist_ok=True)
meta = {}
for k, (_, _bi) in enumerate(bigs):
    name = ORDER[k]
    if name is None:
        continue
    m = np.isin(lab, member[k])
    ys, xs = np.where(m)
    x0, x1 = max(0, xs.min() - PAD), min(m.shape[1], xs.max() + 1 + PAD)
    y0, y1 = max(0, ys.min() - PAD), min(m.shape[0], ys.max() + 1 + PAD)
    a = np.where(m, alpha, 0)[y0:y1, x0:x1]
    out = np.zeros((a.shape[0], a.shape[1], 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = LINE[2], LINE[1], LINE[0]   # BGRA
    out[..., 3] = a
    cv2.imwrite(f'{DST}/stick-{name}.png', out)
    meta[name] = {'w': int(x1 - x0), 'h': int(y1 - y0), 'x0': int(x0), 'y0': int(y0),
                  'bottom': int(y1), 'cx': int((x0 + x1) / 2)}
    print(f'  stick-{name}.png  {x1-x0}x{y1-y0}  （元の絵での足もと y={y1}, 中心 x={(x0+x1)//2}）')

print(json.dumps(meta, ensure_ascii=False))
