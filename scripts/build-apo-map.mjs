#!/usr/bin/env node
/*
 * アポリストを Google マイマップ用に書き出す。
 *   node scripts/build-apo-map.mjs
 *
 * 入力: data/apo-spots.json
 * 出力:
 *   data/apo-map.kml … マイマップに読み込むとピンの色が最初から付く（おすすめ）
 *   data/apo-map.csv … 表で編集したいとき用（マイマップ側で色分けを設定する）
 *
 * ステータスと色:
 *   設置済 = 青 / 交渉中 = 黄 / 断られた = 赤 / 候補 = 白
 * ステータスを data/apo-spots.json で書き換えて再実行 → マイマップに読み込み直す。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SPOTS = JSON.parse(readFileSync('data/apo-spots.json', 'utf8'));

// マイマップが解釈できる標準アイコン。色付きのものを直接指定する。
const STYLE = {
  '設置済':  { icon: 'blu', label: '設置済（青）' },
  '交渉中':  { icon: 'ylw', label: '交渉中（黄）' },
  '断られた': { icon: 'red', label: '断られた（赤）' },
  '候補':    { icon: 'wht', label: '候補（白）' },
};
const ORDER = ['設置済', '交渉中', '断られた', '候補'];

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// 住所があればそれを、無ければ検索用のヒント文字列を使う（マイマップ側で住所検索される）
const where = (s) => s.addr || s.hint || s.name;

// ---- KML ----
const styles = Object.entries(STYLE).map(([k, v]) => `  <Style id="${esc(k)}">
    <IconStyle>
      <scale>1.1</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/paddle/${v.icon}-blank.png</href></Icon>
    </IconStyle>
  </Style>`).join('\n');

const placemarks = ORDER.flatMap(st =>
  SPOTS.filter(s => s.status === st).map(s => {
    const desc = [
      s.cat ? `種別: ${s.cat}` : '',
      s.addr ? `住所: ${s.addr}` : '住所: 未確認（名称で検索して配置）',
      s.tel ? `電話: ${s.tel}` : '',
      s.note || '',
    ].filter(Boolean).join('\n');
      // ★ExtendedData がないと、マイマップ側で「ステータスで色分け」ができない。
    //   マイマップは KML のアイコン色(IconStyle)を読み捨てるので、色は向こうで1回設定する。
    //   そのために、グループ化できる列としてステータス等を持たせる。
    return `  <Placemark>
    <name>${esc(s.name)}</name>
    <styleUrl>#${esc(s.status)}</styleUrl>
    <address>${esc(where(s))}</address>
    <ExtendedData>
      <Data name="ステータス"><value>${esc(s.status)}</value></Data>
      <Data name="種別"><value>${esc(s.cat)}</value></Data>
      <Data name="電話"><value>${esc(s.tel || '')}</value></Data>
      <Data name="住所"><value>${esc(s.addr || '未確認')}</value></Data>
      <Data name="メモ"><value>${esc(s.note || '')}</value></Data>
    </ExtendedData>
    <description>${esc(desc)}</description>
  </Placemark>`;
  })
).join('\n');

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>ぼんぼやーじゅ通信 アポリスト</name>
  <description>設置済=青 / 交渉中=黄 / 断られた=赤 / 候補=白</description>
${styles}
${placemarks}
</Document>
</kml>
`;
writeFileSync('data/apo-map.kml', kml);

// ---- CSV ----
const q = (v = '') => `"${String(v).replace(/"/g, '""')}"`;
const csv = [
  ['名称', '住所または検索語', 'ステータス', '種別', '電話', 'メモ'].map(q).join(','),
  ...ORDER.flatMap(st => SPOTS.filter(s => s.status === st).map(s =>
    [s.name, where(s), s.status, s.cat, s.tel, s.note].map(q).join(','))),
].join('\n') + '\n';
writeFileSync('data/apo-map.csv', '﻿' + csv);  // Excel/Sheets向けにBOM付き

const counts = ORDER.map(st => `${st} ${SPOTS.filter(s => s.status === st).length}`).join(' / ');
console.log(`wrote data/apo-map.kml と data/apo-map.csv — ${SPOTS.length}件（${counts}）`);
const noAddr = SPOTS.filter(s => !s.addr);
if (noAddr.length) console.log(`※住所未確認 ${noAddr.length}件は名称で検索配置: ${noAddr.map(s => s.name).join('、')}`);
