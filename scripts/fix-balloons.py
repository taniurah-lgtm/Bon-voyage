#!/usr/bin/env python3
"""風船の素材から、重なっているもう1個と、余分な紐を落とす。

  python3 scripts/fix-balloons.py

入出力  docs/homepage/assets/art/canva/balloon-a.png
        docs/homepage/assets/art/canva/balloon-b.png
        （**上書きする。**元に戻すときは git で戻す）

🔴 元のCanva素材は、どちらも**風船が2個ずれて重なっていた。**
   後ろ側の1個は輪郭も紐も無く、**刷ると「ずれて2度刷りした」ように見える。**
   紐も2本あって、1個にすると1本余る。

   balloon-a … 後ろ＝水色（輪郭なし）／前＝黄（輪郭と紐あり）→ **水色を消す**
   balloon-b … 後ろ＝黄／前＝珊瑚色                        → **黄を消す**

   紐は、風船の下だけを見て**1行ずつ「前の行に近いほうの筋」だけを残す**。
   2本が交差しても途切れないように、**前の行の位置を覚えながら**たどる。
   白黒版（make-art-outline.py）は、ここを直した素材から作り直される。
"""
import numpy as np, cv2, os

SRC = 'docs/homepage/assets/art/canva'
CFG = {
    # name: (消す色, 残す色, 枝分かれで打ち切るか)
    #   balloon-a … 紐が2本、**首元から分かれている。**打ち切ると根元で切れてしまうので、
    #               1行ずつ近いほうをたどって片方だけ残す
    #   balloon-b … 紐は1本だが、**先がリボンのカールで枝分かれしている。**
    #               分かれた所（x=77）で打ち切る。つなぐと「✗」のような形が残る
    'balloon-a': ('cyan',   'yellow', False),
    'balloon-b': ('yellow', 'red',    True),
}

def masks(im):
    hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)
    H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    op = im[..., 3] > 60
    return {
        'dark':   op & (V < 120),
        'cyan':   op & (H >= 70) & (H <= 110) & (V >= 150),
        'yellow': op & (H >= 14) & (H <= 40) & (S >= 70) & (V >= 150),
        'red':    op & ((H <= 12) | (H >= 170)) & (S >= 90) & (V >= 150),
    }, op

MAX_JUMP = 4      # 紐が1行で動いてよい幅(px)。これを超えたら枝分かれとみなして切る


def single_tail(tail, stop_at_branch=False):
    """紐を1本にする。1行ずつ、前の行にいちばん近い筋だけを残す。"""
    ys, xs = np.where(tail)
    if not len(xs):
        return tail
    # 横に長い紐は、行で見ると1行が丸ごと紐になる。その場合は転置してから通す
    flip = (xs.max() - xs.min()) > (ys.max() - ys.min())
    t = tail.T if flip else tail
    out = np.zeros_like(t)
    prev = None
    for r in range(t.shape[0]):
        cols = np.where(t[r])[0]
        if not len(cols):
            continue
        runs = np.split(cols, np.where(np.diff(cols) > 1)[0] + 1)
        mid = [int(np.mean(x)) for x in runs]
        i = 0 if prev is None else int(np.argmin([abs(m - prev) for m in mid]))
        # 🔴 枝分かれで打ち切る（紐の先のカール）。つなぐと「✗」のような形が残る
        if stop_at_branch and prev is not None and len(runs) > 1:
            break
        # 前の行から大きく飛ぶのも、別の筋に乗り移っている
        if prev is not None and abs(mid[i] - prev) > MAX_JUMP:
            break
        out[r, runs[i]] = True
        prev = mid[i]
    out = cv2.morphologyEx(out.astype(np.uint8), cv2.MORPH_CLOSE,
                           cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))).astype(bool)
    return out.T if flip else out

def pick_tail_component(dark, balloon_bottom):
    """紐が2本あるとき、**風船の下端からぶら下がっているほう**の塊を返す。

    🔴 balloon-b の2本は、片方が**風船の横から出て、風船の裏を通っていた。**
    最初は「風船から遠くまで伸びないほう」で選び、**その裏を通るほうを残してしまった。**
    次は「塊の上端が風船の下端に近いほう」に直したが、
    **風船より上の行を先に切ってから選んでいたので、両方の上端が同じ値になり、直っていなかった。**
    → **切る前の塊で選ぶ。**紐は下から下がるもの。
    """
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
    comps = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 20]
    if len(comps) < 2:
        return dark
    best = min(comps, key=lambda i: abs(int(st[i, cv2.CC_STAT_TOP]) - balloon_bottom))
    return lab == best


for name, (drop, keep, stop_at_branch) in CFG.items():
    p = f'{SRC}/{name}.png'
    im = cv2.cvtColor(cv2.imread(p, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)
    m, op = masks(im)
    before = int(op.sum())

    # ① どちらの紐を残すかを、**行を切る前の塊で**決める
    ys, _ = np.where(m[keep])
    bottom = int(ys.max())
    sel = pick_tail_component(m['dark'], bottom)       # 残す紐（＋balloon-a は風船の輪郭も同じ塊）

    # ② 残した塊のうち、風船より下を紐とみなし、枝分かれがあれば1本にする
    tail = sel.copy()
    tail[:bottom, :] = False
    one = single_tail(tail, stop_at_branch)
    outline = sel & ~tail                              # 風船の輪郭（balloon-b には無い）

    # ③ 🔴 「消す色を消す」のではなく「**残すものだけを残す**」。
    #    色で消すだけだと、**消した風船のふちのぼかしが幽霊の輪のように残る**
    #    （ふちは彩度が低く、色のしきい値に入らない）。消した紐の跡も点線で残った。
    keep_m = m[keep] | one | outline                   # 風船・残す紐・風船の輪郭
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    grow = cv2.dilate(keep_m.astype(np.uint8), k3, iterations=1).astype(bool)
    grow &= ~m[drop]                                   # ふくらませた先が消す色なら、そこは入れない
    im[..., 3] = np.where(grow, im[..., 3], 0)

    cv2.imwrite(p, cv2.cvtColor(im, cv2.COLOR_RGBA2BGRA))
    after = int((im[..., 3] > 60).sum())
    print(f'  {name}: {drop} を消し、紐を1本に  '
          f'（不透明 {before} → {after} px / 紐 {int(tail.sum())} → {int(one.sum())} px）')
