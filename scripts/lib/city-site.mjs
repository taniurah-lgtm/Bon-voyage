// 小平市の公式サイトの障害（2026-10-09〜）。催しのページが開かず、臨時ページだけが出る。
// 障害の間は、読者に見せるページ（カレンダー・年齢別ページ・AI用一覧・会員ページ・noteの下書き）に
// 市のURLを出さない。「公式」ボタンを押すと開かないページに飛ぶため（2026-10-27、これからの催し7件がそうなっていた）。
// 台帳のURLはそのまま残してある。市のサイトが戻ったら CITY_SITE_DOWN を false にするだけで元に戻る。
export const CITY_SITE_DOWN = true;

const CITY_URL = /^https?:\/\/www\.city\.kodaira\.tokyo\.jp\//;

export const publicUrl = (url) => (CITY_SITE_DOWN && CITY_URL.test(url || '') ? '' : url || '');
