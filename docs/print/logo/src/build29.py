import json
P=json.load(open('logo29/paths.json'))
FONTS='<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500&family=Klee+One:wght@600&display=block" rel="stylesheet">'
NAVY='#2F3E48'; CREAM='#FBFAF5'
COL={'leaf':'#A3CC93','pink':'#F3A9B9','gold':'#F2BE62','sky':'#A6D2E6','red':'#EE7C64'}
def page(svg,w,h):
    return f'<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>html,body{{margin:0;background:transparent}}body>svg{{display:block;width:{w}px;height:{h}px}}</style></head><body>{svg}</body></html>'
def fills(on):
    return ''.join(f'<path d="{P[g]}" fill="{COL[g]}"/>' for g in ['leaf','pink','gold','sky','red']) if on else ''
def text(tc,x=672,y1=668,y2=744,s1=58,s2=48):
    return (f'<text x="{x}" y="{y1}" text-anchor="middle" font-family="Klee One" font-weight="600" font-size="{s1}" letter-spacing="1" fill="{tc}">ぼんぼやーじゅ通信</text>'
            f'<text x="{x}" y="{y2}" text-anchor="middle" font-family="Lora" font-weight="500" font-size="{s2}" letter-spacing="2" fill="{tc}">Bon Voyage</text>')
VB="38 -18 1040 1040"
def full(color,bg):
    tc=NAVY if color else '#000'
    b=f'<rect x="-100" y="-100" width="1400" height="1300" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">{b}{fills(color)}<path d="{P["ink"]}" fill="{tc}"/>{text(tc)}</svg>'
def notext(color,bg):
    tc=NAVY if color else '#000'
    b=f'<rect x="-100" y="-100" width="1400" height="1300" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">{b}{fills(color)}<path d="{P["ink"]}" fill="{tc}"/></svg>'
def horiz(color):
    tc=NAVY if color else '#000'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 820">'
      f'<svg x="0" y="0" width="760" height="820" viewBox="130 80 620 840">{fills(color)}<path d="{P["inkh"]}" fill="{tc}"/></svg>'
      f'<text x="740" y="420" font-family="Klee One" font-weight="600" font-size="126" letter-spacing="2" fill="{tc}">ぼんぼやーじゅ通信</text>'
      f'<text x="748" y="545" font-family="Lora" font-weight="500" font-size="96" letter-spacing="4" fill="{tc}">Bon Voyage</text></svg>')
def icon(color,bg):
    tc=NAVY if color else '#000'
    b=f'<rect width="1000" height="1000" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">{b}'
      f'<circle cx="500" cy="500" r="462" fill="none" stroke="{tc}" stroke-width="8"/>'
      f'<g transform="translate(500,505) scale(0.9) translate(-440,-500)">{fills(color)}<path d="{P["inkh"]}" fill="{tc}"/></g></svg>')
def icon2(color,bg):
    tc=NAVY if color else '#000'
    b=f'<rect width="1000" height="1000" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">{b}'
      f'<g transform="translate(505,505) scale(0.98) translate(-440,-500)">{fills(color)}<path d="{P["inkh"]}" fill="{tc}"/></g></svg>')
V={'c-icon2':(icon2(True,CREAM),1000,1000),'m-icon2':(icon2(False,'#fff'),1000,1000),'c-icon':(icon(True,CREAM),1000,1000),'m-icon':(icon(False,'#fff'),1000,1000),'c-full':(full(True,CREAM),1040,1040),'c-full-clear':(full(True,None),1040,1040),
   'm-full':(full(False,'#fff'),1040,1040),'m-full-clear':(full(False,None),1040,1040),
   'c-notext':(notext(True,CREAM),1040,1040),
   'c-horiz':(horiz(True),2000,820),'m-horiz':(horiz(False),2000,820)}
for k,(svg,w,h) in V.items():
    open(f'logo29/{k}.html','w').write(page(svg,w,h)); open(f'logo29/{k}.svg','w').write(svg)
