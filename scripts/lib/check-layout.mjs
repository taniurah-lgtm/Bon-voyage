/*
 * 版下の「文字どうしの重なり」を見る。
 *
 * ★なぜ要るか（2026-09-16）:
 *   裏面のフッターを position:absolute にしたら、CTAの上にぴったり重なった。
 *   ビルドの検査は「ページからの溢れ」しか見ていないので、はみ出し0px・下端12.4mm と
 *   報告しながら、刷ったら読めない版下ができていた。目で見つけるまで気づけなかった。
 *
 * ★絵と文字の重なりは見ない。透過PNGの上に文字を置くのは意図してやっている。
 *   文字どうしは、重なってよいことが無い。
 *
 * 🔴 最初に書いたとき、この検査は何も見つけなかった（空振りしていた）。
 *   原因は「子要素を持たない箱＝文字を抱えている箱」と決めつけたこと。
 *   実際の版下は <br> を含む行が多く、それを全部ふるい落としていた。
 *   **検査を足したら、わざと壊して、落ちることを確かめる。**
 */
export async function checkTextOverlap(page) {
  return page.evaluate(() => {
    const leaves = [];
    document.querySelectorAll('.page *').forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img' || tag === 'svg' || tag === 'br') return;
      // 「文字を直接抱えている箱」＝ <br> 以外の要素の子を持たないもの
      if ([...el.children].some(c => c.tagName.toLowerCase() !== 'br')) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return;
      leaves.push({ t: t.slice(0, 20), r });
    });
    const hits = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i].r, b = leaves[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) hits.push(`「${leaves[i].t}」×「${leaves[j].t}」 ${Math.round(w)}×${Math.round(h)}px`);
      }
    }
    return { hits, checked: leaves.length };
  });
}
