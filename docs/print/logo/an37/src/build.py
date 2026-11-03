ink=open('logo/ink.path').read(); inkb=open('logo/inkb.path').read(); fill=open('logo/fill.path').read()
FONTS='<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Klee+One:wght@600&family=Zen+Maru+Gothic:wght@500;700&display=block" rel="stylesheet">'
def page(svg, size=1080, w=None):
    return f'''<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>html,body{{margin:0;background:transparent}}body>svg{{display:block;width:{w or size}px;height:{size}px}}</style></head><body>{svg}</body></html>'''
def art(inkc, fillc, bg, text, vb="8 -38 1080 1080"):
    bgrect=f'<rect x="-200" y="-200" width="1600" height="1600" fill="{bg}"/>' if bg else ''
    f=f'<path d="{fill}" fill="{fillc}" fill-rule="nonzero"/>' if fillc else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{bgrect}{f}<path d="{ink}" fill="{inkc}" fill-rule="nonzero"/>{text}</svg>'
NAVY='#2F3E48'; RED='#E2553F'; CREAM='#FBFAF5'
tA=(f'<text x="742" y="544" text-anchor="middle" font-family="Lora" font-weight="500" font-size="78" fill="{NAVY}">Bon Voyage</text>'
    f'<text x="745" y="628" text-anchor="middle" font-family="Klee One" font-weight="600" font-size="42" letter-spacing="3" fill="{NAVY}">ぼんぼやーじゅ通信</text>')
tB=(f'<text x="712" y="548" text-anchor="middle" font-family="Klee One" font-weight="600" font-size="62" fill="{NAVY}">ぼんぼやーじゅ</text>'
    f'<text x="712" y="626" text-anchor="middle" font-family="Klee One" font-weight="600" font-size="50" letter-spacing="6" fill="{NAVY}">通信</text>'
    f'<text x="712" y="684" text-anchor="middle" font-family="Lora" font-weight="500" font-style="italic" font-size="30" letter-spacing="3" fill="{NAVY}">Bon Voyage</text>')
V={
 'full-a':art(NAVY,RED,CREAM,tA),
 'full-b':art(NAVY,RED,CREAM,tB),
 'mono-a':art('#000',None,'#fff',tA.replace(NAVY,'#000')),
 'icon-balloon':f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="365 70 470 470"><rect x="0" y="0" width="1200" height="1200" fill="{CREAM}"/><path d="{fill}" fill="{RED}"/><path d="{inkb}" fill="{NAVY}"/></svg>',
 'icon-scene':art(NAVY,RED,CREAM,''),
}
BAL='365 70 470 470'
tR=(f'<text x="744" y="550" text-anchor="middle" font-family="Klee One" font-weight="600" font-size="51" letter-spacing="1" fill="{NAVY}">ぼんぼやーじゅ通信</text>'
    f'<text x="744" y="617" text-anchor="middle" font-family="Lora" font-weight="500" font-size="42" letter-spacing="2" fill="{NAVY}">Bon Voyage</text>')
def horiz(inkc,fillc,bg,tc,rev=False):
    bgrect=f'<rect width="1800" height="600" fill="{bg}"/>' if bg else ''
    f=f'<path d="{fill}" fill="{fillc}"/>' if fillc else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 600">{bgrect}'
      f'<svg x="20" y="20" width="560" height="560" viewBox="{BAL}">{f}<path d="{inkb}" fill="{inkc}"/></svg>'
      + (f'<text x="480" y="300" font-family="Lora" font-weight="500" font-size="150" fill="{tc}">Bon Voyage</text>'
      f'<text x="488" y="430" font-family="Klee One" font-weight="600" font-size="82" letter-spacing="8" fill="{tc}">ぼんぼやーじゅ通信</text></svg>' if not rev else
      f'<text x="478" y="300" font-family="Klee One" font-weight="600" font-size="118" letter-spacing="2" fill="{tc}">ぼんぼやーじゅ通信</text>'
      f'<text x="486" y="412" font-family="Lora" font-weight="500" font-size="86" letter-spacing="4" fill="{tc}">Bon Voyage</text></svg>'))
V['full-clear']=art(NAVY,RED,None,tA)
V['horiz']=horiz(NAVY,RED,None,NAVY)
V['horiz-mono']=horiz('#000',None,None,'#000')
V['full-r']=art(NAVY,RED,CREAM,tR)
V['full-r-clear']=art(NAVY,RED,None,tR)
V['mono-r']=art('#000',None,'#fff',tR.replace(NAVY,'#000'))
V['horiz-r']=horiz(NAVY,RED,None,NAVY,rev=True)
V['horiz-r-mono']=horiz('#000',None,None,'#000',rev=True)
import sys
for k,v in V.items():
    open(f'logo/{k}.html','w').write(page(v, 600, 1800) if k.startswith('horiz') else page(v)); open(f'logo/{k}.svg','w').write(v)
