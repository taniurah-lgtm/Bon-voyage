import sys, time
from PIL import Image
import numpy as np, cv2, potrace
im=Image.open('an37.png').convert('L')
a=np.asarray(im).astype(np.uint8).copy()
S=2
big=cv2.resize(a,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
big=cv2.GaussianBlur(big,(3,3),0)
ink=(big<150)
n,lab,st,_=cv2.connectedComponentsWithStats(ink.astype(np.uint8),8)
def inside(i,x0,y0,x1,y1):
    x,y,w,h,_a=st[i]; return x>=x0*S and y>=y0*S and x+w<=x1*S and y+h<=y1*S
rm=[i for i in range(1,n) if inside(i,0,0,300,150) or inside(i,452,455,980,670)]
print('removed comps',len(rm))
ink[np.isin(lab,rm)]=False
# balloon interior
inv=(~ink).astype(np.uint8)*255
h,w=inv.shape
mask=np.zeros((h+2,w+2),np.uint8)
ff=inv.copy()
cv2.floodFill(ff,mask,(605*S,215*S),128)
fill=(ff==128)
print('balloon fill px', fill.sum(), 'bbox', np.argwhere(fill).min(0)//S, np.argwhere(fill).max(0)//S)
np.save('ink.npy',ink); np.save('fill.npy',fill)
yy,xx=np.mgrid[0:ink.shape[0],0:ink.shape[1]]
dist=np.hypot(xx/S-548,yy/S-502)
inkb=ink&(dist<438)&(yy/S<448)
n2,lab2,st2,_=cv2.connectedComponentsWithStats(inkb.astype(np.uint8),8)
big2=[i for i in range(1,n2) if st2[i][4]>40*S*S]
inkb=np.isin(lab2,big2)
print('balloon-only comps',len(big2))
def tosvgpath(bm):
    t=time.time()
    bmp=potrace.Bitmap(bm)
    path=bmp.trace(turdsize=6, alphamax=1.0, opticurve=True, opttolerance=0.3)
    parts=[]
    for curve in path:
        sp=curve.start_point; parts.append(f"M{sp.x/S:.2f},{sp.y/S:.2f}")
        for seg in curve.segments:
            if seg.is_corner:
                parts.append(f"L{seg.c.x/S:.2f},{seg.c.y/S:.2f}L{seg.end_point.x/S:.2f},{seg.end_point.y/S:.2f}")
            else:
                parts.append(f"C{seg.c1.x/S:.2f},{seg.c1.y/S:.2f} {seg.c2.x/S:.2f},{seg.c2.y/S:.2f} {seg.end_point.x/S:.2f},{seg.end_point.y/S:.2f}")
        parts.append('z')
    print('traced', len(path), 'curves in', round(time.time()-t,1),'s')
    return ''.join(parts)
open("ink.path","w").write(tosvgpath(~ink))
open("fill.path","w").write(tosvgpath(~fill))
open("inkb.path","w").write(tosvgpath(~inkb))
