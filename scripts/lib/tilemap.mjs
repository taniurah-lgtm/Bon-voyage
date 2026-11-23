// マス目の地図（幼稚園マップ・カフェマップ）の並べ方。
//   外枠（bounds）を cols×rows のマスに分け、場所（園・お店・駅）を実際の位置にいちばん近いマスへ置く。
//   重ならないように、ずれの合計が小さくなるまで入れ替える（同じ入力なら、いつも同じ結果になる）。
//
//   nodes: [{ id, lat, lon, w }]  w は重み（駅は 0.7 など、軽くすると先に動く）
//   ys:    縦のずれの重み（マスが横長なら小さく）
//   fixed: { id: マス番号 }  決まったマスに置くもの（2026-11-23 オーナー「中央線は横一列」のように、
//          線路の並びなど地図の読みやすさを優先したいとき）。残りを、空いたマスに自動で並べる
//   返り値: { at: Map(id → マス番号), outside: [id…]（外枠の外にあったもの） }
export function layoutTiles({ cols, rows, bounds, ys = 0.55, nodes, fixed = {} }) {
  const B = bounds;
  const pos = new Map(nodes.map((n) => [n.id, [(n.lon - B.w) / (B.e - B.w), (B.n - n.lat) / (B.n - B.s)]]));
  const outside = nodes.filter((n) => { const [x, y] = pos.get(n.id); return x < 0 || x > 1 || y < 0 || y > 1; }).map((n) => n.id);
  const center = (c) => [((c % cols) + 0.5) / cols, (Math.floor(c / cols) + 0.5) / rows];
  const cost = (n, c) => { const [x, y] = center(c); const [px, py] = pos.get(n.id); return (n.w ?? 1) * ((px - x) ** 2 + ((py - y) * ys) ** 2); };
  const at = new Map();
  if (nodes.length > cols * rows) return { at, outside, tooMany: true };
  const free = new Set([...Array(cols * rows).keys()]);
  for (const [id, c] of Object.entries(fixed)) {
    if (!nodes.some((n) => n.id === id) || !free.has(c)) continue;
    at.set(id, c); free.delete(c);
  }
  const movable = nodes.filter((n) => !at.has(n.id));
  const left = movable.slice();
  while (left.length) {
    let best = null;
    for (const n of left) for (const c of free) {
      const v = cost(n, c);
      if (!best || v < best.v - 1e-12 || (Math.abs(v - best.v) <= 1e-12 && (n.id + c) < (best.n.id + best.c))) best = { v, n, c };
    }
    at.set(best.n.id, best.c); free.delete(best.c); left.splice(left.indexOf(best.n), 1);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
      const a = movable[i], b = movable[j], ca = at.get(a.id), cb = at.get(b.id);
      if (cost(a, cb) + cost(b, ca) < cost(a, ca) + cost(b, cb) - 1e-12) { at.set(a.id, cb); at.set(b.id, ca); improved = true; }
    }
    for (const n of movable) for (const c of [...free]) {
      if (cost(n, c) < cost(n, at.get(n.id)) - 1e-12) { free.add(at.get(n.id)); free.delete(c); at.set(n.id, c); improved = true; }
    }
  }
  return { at, outside };
}
