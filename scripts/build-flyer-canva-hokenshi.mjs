#!/usr/bin/env node
/*
 * Canva版レイアウトの「保健師版」表裏の PDF / PNG を作る。
 *   node scripts/build-flyer-canva-hokenshi.mjs
 *
 * こども家庭センターの保健師さんが、新生児訪問で直接お渡しする50部用。
 * 版下: docs/homepage/flyer-a4-canva-hokenshi.html（表・カラー）
 *       docs/homepage/flyer-a4-canva-hokenshi-back.html（裏・白黒）
 *
 * ★下端8mmは安全帯。最下段の文字は必ず8mm上で止める。
 * ★書体は bash scripts/setup-fonts.sh で入れる。無いと IPAゴシックに落ちる。
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkTextOverlap } from './lib/check-layout.mjs';

const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});

const OUT = 'docs/homepage/assets';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

const SIDES = [
  { src: 'docs/homepage/flyer-a4-canva-hokenshi.html',      out: 'flyer-a4-canva-hokenshi',      label: '表（カラー）' },
  { src: 'docs/homepage/flyer-a4-canva-hokenshi-back.html', out: 'flyer-a4-canva-hokenshi-back', label: '裏（白黒）' },
];

let ng = false;
for (const s of SIDES) {
  const url = pathToFileURL(resolve(s.src)).href;

  {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: `${OUT}/${s.out}.pdf`, width: '210mm', height: '297mm',
      printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${OUT}/${s.out}-preview.png` });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const p = document.querySelector('.page');
      // ★刷って切れるのは「文字」なので、最下段の文字の箱で測る（padding込みの矩形で測らない）
      const f = document.querySelector('.foot').getBoundingClientRect();
      return { over: p.scrollHeight - p.clientHeight, gap: p.getBoundingClientRect().bottom - f.bottom };
    });
    const { hits: laps, checked } = await checkTextOverlap(page);
    await page.close();
    const gapMm = (r.gap / 794 * 210).toFixed(1);
    const bad = r.over > 2 || Number(gapMm) < 7 || laps.length > 0;
    if (bad) ng = true;
    console.log(`${bad ? '🔴' : '  '} ${s.label}  ${s.out}.pdf  はみ出し ${r.over}px / 下端まで ${gapMm}mm / 文字の重なり ${laps.length}件（${checked}箇所）`);
    laps.forEach(l => console.error('     ' + l));
  }
}

await browser.close();
if (ng) { console.error('\n🔴 版面からはみ出している。刷らないこと。'); process.exit(1); }
console.log('\n★刷るのは表＝カラー、裏＝白黒。preview は見え方の確認だけに使う。');
