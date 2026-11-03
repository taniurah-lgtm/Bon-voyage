import numpy as np, cv2, time, json, potrace
from PIL import Image
S=2
a=np.asarray(Image.open('an29.png').convert('L'))
big=cv2.resize(a,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
big=cv2.GaussianBlur(big,(3,3),0)
ink=(big<150)
n,lab,st,_=cv2.connectedComponentsWithStats(ink.astype(np.uint8),8)
def inside(i,x0,y0,x1,y1):
    x,y,w,h,_a=st[i]; return x>=x0*S and y>=y0*S and x+w<=x1*S and y+h<=y1*S
boxes=[(0,0,280,120),(405,550,935,682),(480,675,705,790),(390,810,760,880)]
rm=[i for i in range(1,n) if any(inside(i,*b) for b in boxes)]
print('removed',len(rm)); ink[np.isin(lab,rm)]=False
np.save('ink.npy',ink)
# regions
k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))
inkc=cv2.dilate(ink.astype(np.uint8),k)
bg=(inkc==0).astype(np.uint8)
m,rl,rs,rc=cv2.connectedComponentsWithStats(bg,4)
regs=[]
for i in range(1,m):
    x,y,w,h,ar=rs[i]
    if ar<60*S*S//4 or ar>200000: continue
    regs.append(dict(id=int(i),bbox=[int(x/S),int(y/S),int(w/S),int(h/S)],area=int(ar),c=[round(rc[i][0]/S),round(rc[i][1]/S)]))
print(len(regs),'regions')
json.dump(regs,open('regions.json','w'))
np.save('rl.npy',rl)
# debug image: each region random color + id
dbg=np.stack([np.where(ink,40,250)]*3,-1).astype(np.uint8)
rng=np.random.default_rng(1)
for r in regs:
    dbg[rl==r['id']]=rng.integers(80,255,3)
d=Image.fromarray(dbg).resize((a.shape[1],a.shape[0]))
from PIL import ImageDraw
dr=ImageDraw.Draw(d)
for r in regs: dr.text(tuple(r['c']),str(r['id']),fill=(0,0,0))
d.save('debug.png')
