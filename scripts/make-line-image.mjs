#!/usr/bin/env node
// LINE に送る画像を、HTML（チラシと同じ書体・絵）から書き出す。
//   node scripts/make-line-image.mjs docs/print/line/guide-2026-10-21.html [出力の名前]
// 出力: docs/homepage/assets/line/<名前>.jpg（1040×1040・原寸）と <名前>-preview.jpg（520×520・LINEのプレビュー用・1MB未満）
// ★書体は bash scripts/setup-fonts.sh で入れておく（無いと IPAゴシックに落ちる）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
const src = resolve(process.argv[2]);
const name = process.argv[3] || basename(src, '.html');
const outDir = resolve('docs/homepage/assets/line'); mkdirSync(outDir, { recursive: true });
const tmp = `/tmp/line-${name}-2x.png`;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1040, height: 1040 }, deviceScaleFactor: 2 })).newPage();
await p.goto('file://' + src, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: tmp, clip: { x: 0, y: 0, width: 1040, height: 1040 } });
await b.close();
// 2倍で撮って縮める（文字のふちをなめらかに）
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(tmp)}).convert('RGB')
im.resize((1040,1040), Image.LANCZOS).save(${JSON.stringify(outDir + '/' + name + '.jpg')}, quality=90, optimize=True, progressive=True)
im.resize((520,520), Image.LANCZOS).save(${JSON.stringify(outDir + '/' + name + '-preview.jpg')}, quality=85, optimize=True)
`]);
console.log('wrote', `${outDir}/${name}.jpg`, `${outDir}/${name}-preview.jpg`);
