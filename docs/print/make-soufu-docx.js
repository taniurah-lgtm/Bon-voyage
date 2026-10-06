// 送付状の .docx を作る（npm の docx が必要）。node docs/print/make-soufu-docx.js → docs/print/soufu-letter.docx
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak } = require('docx');

const F = { ascii: 'Yu Mincho', eastAsia: '游明朝', hAnsi: 'Yu Mincho', cs: 'Yu Mincho' };
const t = (text, o = {}) => new TextRun({ text, font: F, size: o.size || 22, bold: o.bold });
const P = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], alignment: o.align, spacing: { after: o.after ?? 0, before: o.before ?? 0, line: o.line ?? 360 }, indent: o.indent });
const blank = (n = 1) => Array.from({ length: n }, () => P(t('')));

const FROM = [
  P(t('ぼんぼやーじゅ通信の会', { size: 24 }), { indent: { left: 5100 } }),
  P(t('小平市民活動支援センター あすぴあ', { size: 20 }), { indent: { left: 5100 } }),
  P(t('登録団体（第254号）', { size: 20 }), { indent: { left: 5100 } }),
  P(t('担当　＿＿＿＿＿＿＿＿＿＿', { size: 20 }), { indent: { left: 5100 } }),
];
const FOOT = [
  new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } }, spacing: { before: 600 }, children: [t('ぼんぼやーじゅ通信の会（運営：ニコマル）　お問い合わせ：tokyo.papa.home@gmail.com', { size: 17 })] }),
  P(t('ホームページ：https://bonvoya.nicomaru.tokyo/', { size: 17 })),
];

function encl(text) {
  const b = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const borders = { top: b, bottom: b, left: b, right: b };
  return new Table({
    alignment: AlignmentType.CENTER,
    width: { size: 7600, type: WidthType.DXA },
    columnWidths: [1800, 5800],
    rows: [new TableRow({ children: [
      new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: { top: 140, bottom: 140, left: 160, right: 160 }, children: [P(t('同封物', { size: 23 }), { align: AlignmentType.CENTER })] }),
      new TableCell({ borders, width: { size: 5800, type: WidthType.DXA }, margins: { top: 140, bottom: 140, left: 240, right: 160 }, children: [P(t(text, { size: 23 }))] }),
    ] })],
  });
}

function letter({ addr, to, body, enclosure, last }) {
  return [
    P(t('2026年　　月　　日'), { align: AlignmentType.RIGHT }),
    ...blank(1),
    P(t(addr, { size: 20 })),
    ...to.map((x) => P(t(x, { size: 28 }))),
    ...blank(1),
    ...FROM,
    ...blank(1),
    P(t('送 付 の ご 案 内', { size: 34, bold: true }), { align: AlignmentType.CENTER, before: 200, after: 300 }),
    ...body.map((x) => P(t(x), { indent: { firstLine: 220 }, after: 160, line: 400 })),
    P(t('記'), { align: AlignmentType.CENTER, before: 300, after: 200 }),
    encl(enclosure),
    P(t('以上'), { align: AlignmentType.RIGHT, before: 200 }),
    ...FOOT,
    ...(last ? [] : [new Paragraph({ children: [new PageBreak()] })]),
  ];
}

const pages = [
  letter({
    addr: '〒187-8570　東京都小平市小川町1-830',
    to: ['白梅学園大学附属 白梅幼稚園', 'ご担当者様'],
    body: [
      '先日はお電話にてご対応いただき、ありがとうございました。お話しさせていただいたとおり、チラシをお送りいたします。お手すきの際に、玄関などに置いていただけましたら幸いです。',
      '「ぼんぼやーじゅ通信」は、小平市の未就学児・小学生のいるご家庭に向けて、週末のおでかけ情報を毎週水曜日にLINEで無料でお届けしているものです。市や施設の公式ページで一件ずつ確かめた情報だけを載せています。',
      'お忙しいところ恐れ入りますが、どうぞよろしくお願いいたします。',
    ],
    enclosure: '「ぼんぼやーじゅ通信」チラシ　20部',
  }),
  letter({
    addr: '〒187-0011　東京都小平市鈴木町1-341',
    to: ['小平みどり幼稚園', '園長先生'],
    body: [
      'いつも大変お世話になっております。先日はチラシを置いていただき、本当にありがとうございました。',
      '今月分のチラシをお送りいたします。お手すきの際に、玄関などに置いていただけましたら幸いです。',
      '園の皆さまにも、どうぞよろしくお伝えください。',
    ],
    enclosure: '「ぼんぼやーじゅ通信」チラシ　　　　部',
  }),
  letter({
    addr: '〒　　　－　　　　　＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿',
    to: ['＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿', '＿＿＿＿＿＿＿＿＿＿　様'],
    body: [
      'いつも大変お世話になっております。',
      'チラシをお送りいたします。お手すきの際に、置いていただけましたら幸いです。',
      '今後とも、どうぞよろしくお願いいたします。',
    ],
    enclosure: '「ぼんぼやーじゅ通信」チラシ　　　　部',
    last: true,
  }),
];

const doc = new Document({
  styles: { default: { document: { run: { font: F, size: 22 } } } },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1400, bottom: 1000, left: 1420, right: 1420 } } }, children: pages.flat() }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync('/home/user/Bon-voyage/docs/print/soufu-letter.docx', b); console.log('ok'); });
