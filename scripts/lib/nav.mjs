// 全ページ共通のナビの2段目（2026-11-05 オーナー「スマホだと園庭開放や児童館に行くのが大変。カレンダーやマップと同じく上でタップできるように」）
// 1段目: 通信の名前・LINEで受け取る。2段目: カレンダー／マップ／園庭開放／児童館・図書館（いつも見える。狭い画面では横に流せる）
const ITEMS = [
  { key: 'cal', href: '/calendar.html', icon: '📅', label: 'カレンダー' },
  { key: 'map', href: '/map.html', icon: '🗺️', label: 'マップ' },
  { key: 'entei', href: '/entei.html', icon: '🌱', label: '園庭開放' },
  { key: 'teirei', href: '/teirei.html', icon: '📚', label: '児童館・図書館' },
];
export function navSub(current = '') {
  const a = ITEMS.map((i) => `<a href="${i.href}"${i.key === current ? ' aria-current="page"' : ''}><span aria-hidden="true">${i.icon}</span>${i.label}</a>`).join('');
  return `  <div class="bvnav-sub"><div class="bvnav-sub-in">${a}</div></div>`;
}
export const NAV_SUB_ITEMS = ITEMS;
