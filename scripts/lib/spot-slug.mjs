// おでかけマップのスポット名 → 一覧の要素id。assets/bv-map.js の slug() と同じ規則にすること。
// 🔴 2026-11-01: 以前は名前の先頭6バイト（＝日本語2文字）だけで作っていて、46件中19件のidがぶつかっていた
//    （「小川〜」「花小〜」など）。「くわしく ↓」が別の施設に飛んでいた。名前の全部で作る。
export const spotSlug = (name) => 's-' + Buffer.from(name).toString('hex');
