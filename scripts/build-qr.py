#!/usr/bin/env python3
"""配布先コードごとのQRコードを作る。

  python3 scripts/build-qr.py

出力: docs/homepage/assets/qr/
  f-<code>.svg        ★印刷はこれ。ベクターなので拡大しても崩れない
  f-<code>.png        1200px・白地。明るい背景に置くとき
  f-<code>-nobg.png   1200px・背景ぬき。クラフト紙や濃い地に置くとき

★誤り訂正はM、静穏域は4モジュール。刷る大きさは25mm角以上にする。
★配布先の一覧は scripts/build-flyer-landings.mjs の VENUES と揃えること。
  片方だけ足すと、QRはあるのに着地ページが無い（404）状態になる。

必要: pip install qrcode pillow
      （サイトの日次ビルドには入れていない。コードを足したときだけ手で回す）
"""
import os
import qrcode
import qrcode.image.svg
from PIL import Image

OUT = 'docs/homepage/assets/qr'
BASE = 'https://bonvoya.nicomaru.tokyo/f/'

VENUES = [
    ('asupia',     '小平市民活動支援センター あすぴあ'),
    ('kodomo',     '子ども家庭支援センター おひさまひろば'),
    ('rokuto',     '多摩六都科学館'),
    ('seibu',      'せいぶ通り商店会（加盟店）'),
    ('kominkan-n', '花小金井北公民館'),
    ('kominkan-s', '花小金井南公民館'),
    ('library',    '小平市立図書館'),
    ('jidokan',    '児童館'),
    ('clinic',     '小児科・小児歯科の待合'),
    ('en',         '私立の保育園・幼稚園'),
    ('poster',     'ポスター掲示（場所を問わない共通枠）'),
    ('hand',       '手渡し・口コミ'),
    ('kraft',      'クラフト紙チラシ（黒1色・A4）'),
]

os.makedirs(OUT, exist_ok=True)

def make(url, **kw):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,
                      box_size=10, border=4, **kw)
    q.add_data(url)
    q.make(fit=True)
    return q

for code, label in VENUES:
    url = BASE + code

    make(url, image_factory=qrcode.image.svg.SvgPathImage).make_image().save(f'{OUT}/f-{code}.svg')

    im = make(url).make_image(fill_color='black', back_color='white').convert('RGBA')
    im = im.resize((1200, 1200), Image.NEAREST)
    im.save(f'{OUT}/f-{code}.png')

    # 背景ぬき。クラフト紙では白は刷られないので、静穏域も紙の色になる
    nb = im.copy()
    px = nb.load()
    for y in range(1200):
        for x in range(1200):
            if px[x, y][0] > 200:
                px[x, y] = (0, 0, 0, 0)
    nb.save(f'{OUT}/f-{code}-nobg.png')

    print(f'  f-{code:11} {url}   ← {label}')

print(f'\n{len(VENUES)}件 × 3形式を {OUT}/ に出しました。')
