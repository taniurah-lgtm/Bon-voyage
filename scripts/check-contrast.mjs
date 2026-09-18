/**
 * 文字色と地色のコントラストを、ライトとダークの両方で測る。
 *
 * ★このスクリプトを作った理由:
 *   コントラストの直しで「片方のモードだけ測って閉じる」を3回続けた。
 *   - 土日のマス: ライトだけ測って直し、ダークで 1.81:1 になっていた
 *   - 特典の✓: ダークだけ測って直し、ライトで 2.61:1 のまま
 *   - ふきだしの年齢目安: ライトを上げた代わりにダークを 3.55→2.02 に落とした
 *   人の目で片側だけ見ると必ずこうなるので、機械に両方測らせる。
 *
 *   使い方: node scripts/check-contrast.mjs            （docs/homepage を 8899 で配信中に）
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.BASE || 'http://localhost:8899';
const PASS = process.env.MEMBER_PASS_TEST || 'testpass';

// 見るところ。sel は「文字の要素」、大きい文字（18.66px以上のbold / 24px以上）は 3:1 でよい
const TARGETS = [
  { page: '/', sel: '.paid-list .ck', name: '特典の✓' },
  { page: '/', sel: '.perks-title', name: '特典の見出し' },
  { page: '/', sel: '.cmp-head.sup', name: '比較表「サポーター」' },
  { page: '/', sel: '.ages b', name: 'プレビューの◎' },
  { page: '/', sel: '.issue-top .d', name: '号数' },
  { page: '/', sel: '.support-line a', name: '応援の1行' },
  { page: '/calendar.html', sel: '.bvc-cell.has.sat:not(.out) .bvc-num', name: '土（予定あり）' },
  { page: '/calendar.html', sel: '.bvc-cell.has.sun:not(.out) .bvc-num', name: '日（予定あり）' },
  { page: '/calendar.html', sel: '.bvc-window', name: '「公開ぶんは…まで」' },
  { page: '/calendar.html', sel: '.bvc-kids', name: '子連れメモ' },
  { page: '/calendar.html', sel: '.bvc-dltel', name: '締切の申込先' },
  { page: '/map.html', sel: '.bvm-chip.is-on', name: '選んだチップ' },
  { page: '/map.html', sel: '.spot .ages', name: 'スポットの年齢目安' },
  { page: '/map.html', sel: '.bvm-note', name: '地図の注記' },
  { page: '/m/s7f2ka/', sel: '#go', name: '会員ゲートの「ひらく」', gate: false },
  { page: '/m/s7f2ka/', sel: '.gate .join', name: '会員ゲートのCTA', gate: false },
  { page: '/m/s7f2ka/', sel: '.gate .hint', name: '会員ゲートの案内', gate: false },
  { page: '/m/s7f2ka/', sel: '.sec-note', name: '会員ページの節の説明', gate: true },
  { page: '/m/s7f2ka/', sel: '.spot .desc', name: 'スポットの説明', gate: true },
];

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const ratio = (fg, bg) => {
  const a = lum(parse(fg)), b = lum(parse(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const rows = [];
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: scheme,
  });
  const page = await ctx.newPage();
  let loaded = '';
  for (const t of TARGETS) {
    if (loaded !== t.page) {
      await page.goto(BASE + t.page, { waitUntil: 'networkidle' });
      loaded = t.page;
      if (t.page.startsWith('/m/')) {
        try {
          await page.fill('#pw', PASS);
          if (t.gate) { await page.click('#go'); await page.waitForSelector('.bvc-grid tbody tr', { timeout: 12000 }); }
        } catch (e) { /* ゲートが無い頁 */ }
      }
      if (t.page === '/map.html') {
        await page.waitForSelector('.bvm-chip', { timeout: 8000 }).catch(() => {});
      }
    }
    if (t.gate) {
      // 解錠が必要な節はここで開き直す
      const opened = await page.$('.bvc-grid tbody tr');
      if (!opened) {
        await page.fill('#pw', PASS).catch(() => {});
        await page.click('#go').catch(() => {});
        await page.waitForSelector('.bvc-grid tbody tr', { timeout: 12000 }).catch(() => {});
      }
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    }
    const got = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const st = getComputedStyle(el);
      // 地の色を上へたどる。★グラデーションは backgroundColor が透明として返るので、
      //   そのままだと親の色を拾って「1.00:1」のような嘘の値になる。
      //   background-image の色停止を読んで、いちばん明るい/暗い側の両方を見る。
      let bg = st.backgroundColor, n = el, grad = null;
      while (n) {
        const s2 = getComputedStyle(n);
        if (/gradient/.test(s2.backgroundImage)) {
          grad = (s2.backgroundImage.match(/rgba?\([^)]*\)/g) || []);
          if (grad.length) break;
        }
        if (s2.backgroundColor !== 'rgba(0, 0, 0, 0)' && s2.backgroundColor !== 'transparent') {
          bg = s2.backgroundColor; break;
        }
        n = n.parentElement;
      }
      const px0 = parseFloat(st.fontSize) || 16;
      const w0 = Number(st.fontWeight) || 400;
      if (grad && grad.length) {
        return { fg: st.color, bg: grad[0], bgAlt: grad[grad.length - 1], px: px0,
                 large: px0 >= 24 || (px0 >= 18.66 && w0 >= 700) };
      }
      const px = parseFloat(st.fontSize) || 16;
      const w = Number(st.fontWeight) || 400;
      return { fg: st.color, bg, px, large: px >= 24 || (px >= 18.66 && w >= 700) };
    }, t.sel);
    if (!got) { rows.push({ ...t, scheme, r: null }); continue; }
    // グラデーションは、いちばん条件の悪い停止で判定する
    const r = got.bgAlt
      ? Math.min(ratio(got.fg, got.bg), ratio(got.fg, got.bgAlt))
      : ratio(got.fg, got.bg);
    rows.push({ ...t, scheme, r, need: got.large ? 3 : 4.5, px: got.px });
  }
  await ctx.close();
}
await browser.close();

let bad = 0, missing = 0;
const byName = new Map();
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, {});
  byName.get(r.name)[r.scheme] = r;
}
console.log('名前                          light    dark   要求');
for (const [name, v] of byName) {
  const f = (r) => (r && r.r != null ? r.r.toFixed(2) : '  −  ');
  const need = (v.light && v.light.need) || (v.dark && v.dark.need) || 4.5;
  const ng = ['light', 'dark'].filter((s) => v[s] && v[s].r != null && v[s].r < need);
  if (!v.light?.r && !v.dark?.r) missing++;
  if (ng.length) bad++;
  console.log(
    (name + '                              ').slice(0, 28) +
    ' ' + f(v.light).padStart(6) + ' ' + f(v.dark).padStart(6) + '  ' + String(need).padStart(4) +
    (ng.length ? '   🔴 ' + ng.join(',') + ' が不足' : '')
  );
}
console.log(`\n不足 ${bad}件 / 見つからなかった要素 ${missing}件`);
if (bad) process.exitCode = 1;
