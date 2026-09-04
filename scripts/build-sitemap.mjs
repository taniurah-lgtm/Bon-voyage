#!/usr/bin/env node
/*
 * sitemap.xml を組み立てる。
 *   node scripts/build-sitemap.mjs
 *
 * 手で書いていたため、主力の calendar.html / map.html が入っておらず、
 * lastmod も 2026-07-21 のまま古びていた。公開するページから作る。
 *
 * 会員ページ(m/) とチラシの着地(f/) は noindex なので入れない。
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'https://bonvoya.nicomaru.tokyo';
const DIR = 'docs/homepage';
const OUT = `${DIR}/sitemap.xml`;

// 優先度と更新頻度。載せないものは null。
const PAGES = {
  'index.html': { loc: '/', freq: 'weekly', pri: '1.0' },
  'calendar.html': { freq: 'weekly', pri: '0.9' },
  'map.html': { freq: 'weekly', pri: '0.9' },
  'guide.html': { freq: 'monthly', pri: '0.8' },
  'issues.html': { freq: 'weekly', pri: '0.8' },
  'tokushoho.html': { freq: 'yearly', pri: '0.3' },
  'card.html': { freq: 'yearly', pri: '0.3' },
};

const rows = [];
for (const [file, cfg] of Object.entries(PAGES)) {
  const path = `${DIR}/${file}`;
  if (!existsSync(path)) { console.log(`  – ${file}: 無いので入れない`); continue; }
  const lastmod = statSync(path).mtime.toISOString().slice(0, 10);
  rows.push(
    `  <url>\n    <loc>${BASE}${cfg.loc || '/' + file}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>${cfg.freq}</changefreq>\n    <priority>${cfg.pri}</priority>\n  </url>`
  );
}

writeFileSync(OUT,
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  rows.join('\n') + '\n</urlset>\n'
);
console.log(`wrote ${OUT}（${rows.length}ページ）`);
