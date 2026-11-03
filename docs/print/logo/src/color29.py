import numpy as np, cv2, json, potrace
S=2
ink=np.load('ink.npy'); rl=np.load('rl.npy'); regs=json.load(open('regions.json'))
def near(c,p,r): return (c[0]-p[0])**2+(c[1]-p[1])**2<=r*r
FLOWERS=[((275,345),55,'pink'),((365,405),48,'gold'),((195,510),48,'sky'),((215,425),20,'pink')]
skip=set()
groups={'red':[],'pink':[],'gold':[],'sky':[],'leaf':[]}
for r in regs:
    c=r['c']; x,y,w,h=r['bbox']
    if x<=615<=x+w and y<=215<=y+h and r['area']>20000: groups['red'].append(r['id']); continue
    if near(c,(570,345),22): groups['red'].append(r['id']); continue   # knot
    if near(c,(260,728),14): skip.add(r['id']); continue               # sliver between stems
    if c[0]>520: skip.add(r['id']); continue
    for p,rad,col in FLOWERS:
        if near(c,p,rad): groups[col].append(r['id']); break
    else: groups['leaf'].append(r['id'])
print({k:len(v) for k,v in groups.items()}, 'skip', sorted(skip))
k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
def tr(bm):
    p=potrace.Bitmap(~bm).trace(turdsize=4, alphamax=1.0, opticurve=True, opttolerance=0.3)
    out=[]
    for cv in p:
        sp=cv.start_point; out.append(f"M{sp.x/S:.1f},{sp.y/S:.1f}")
        for sg in cv.segments:
            if sg.is_corner: out.append(f"L{sg.c.x/S:.1f},{sg.c.y/S:.1f}L{sg.end_point.x/S:.1f},{sg.end_point.y/S:.1f}")
            else: out.append(f"C{sg.c1.x/S:.1f},{sg.c1.y/S:.1f} {sg.c2.x/S:.1f},{sg.c2.y/S:.1f} {sg.end_point.x/S:.1f},{sg.end_point.y/S:.1f}")
        out.append('z')
    return ''.join(out)
paths={}
for g,ids in groups.items():
    m=np.isin(rl,ids).astype(np.uint8)
    m=cv2.dilate(m,k)>0
    paths[g]=tr(m)
paths['ink']=tr(ink)
yy,xx=np.mgrid[0:ink.shape[0],0:ink.shape[1]]
dist=np.hypot(xx/S-558.5,yy/S-502.5)
paths['inkh']=tr(ink&(dist<455))
json.dump(paths,open('paths.json','w'))
print('ok')
