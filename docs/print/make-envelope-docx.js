// 封筒の宛名ラベルの .docx を作る（npm の docx が必要）。NODE_PATH=$(npm root -g) node docs/print/make-envelope-docx.js → docs/print/envelope-label.docx
// 2026-10-25 オーナー「使いまわせるように docx で。住所はこちらで入れる」。
//   1園＝A4 1枚。上が表（宛名）、下が裏（差出人）。点線で切って角形2号に貼る。
//   枠は表（テーブル）にしてある。テキストボックスだとスマホの Word で直しにくいため。
//   🔒 差出人の住所はここに書かない（オーナーが Word で入れる）。
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeightRule, PageBreak, LineRuleType, AlignmentType } = require('docx');

const F = { ascii: 'Yu Mincho', eastAsia: '游明朝', hAnsi: 'Yu Mincho', cs: 'Yu Mincho' };
const G = { ascii: 'Yu Gothic', eastAsia: '游ゴシック', hAnsi: 'Yu Gothic', cs: 'Yu Gothic' };
const mm = (n) => Math.round(n * 56.7);
const t = (text, o = {}) => new TextRun({ text, font: o.font || F, size: o.size || 22, bold: o.bold, color: o.color, characterSpacing: o.spacing });
// 行の高さは文字の大きさに合わせる（auto）。固定にすると大きい字が重なる
const P = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { before: o.before ?? 0, after: o.after ?? 0, line: o.line ?? 264, lineRule: LineRuleType.AUTO }, indent: o.indent });
const cap = (text, before = 0) => P(t(text, { font: G, size: 16, color: '888888' }), { before, after: 60 });

function label(width, height, margins, children) {
  const b = { style: BorderStyle.DASHED, size: 6, color: '999999' };
  return new Table({
    width: { size: mm(width), type: WidthType.DXA },
    columnWidths: [mm(width)],
    rows: [new TableRow({
      height: { value: mm(height), rule: HeightRule.ATLEAST },
      children: [new TableCell({ borders: { top: b, bottom: b, left: b, right: b }, width: { size: mm(width), type: WidthType.DXA }, margins, children })],
    })],
  });
}

function page({ zip, addr, to, name = '園長先生' }, last) {
  return [
    cap('表（宛名）— 点線で切って、封筒の表に貼る'),
    label(170, 112, { top: mm(13), bottom: mm(8), left: mm(16), right: mm(10) }, [
      P(t(`〒${zip}`, { size: 34, spacing: 20 })),
      P(t(addr, { size: 38 }), { before: 80 }),
      P(t(to, { size: 54, bold: true, spacing: 20 }), { before: 560 }),
      P(t(name, { size: 50, spacing: 30 }), { before: 100, indent: { left: mm(34) } }),
      // 「チラシ在中」の赤い枠は段落の罫線で（文字の罫線は右端が欠けて見えるソフトがある）
      new Paragraph({ children: [t('チラシ在中', { size: 28, color: 'C00000', spacing: 60 })], alignment: AlignmentType.CENTER, spacing: { before: 700 }, indent: { right: mm(102) },
        border: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((k) => [k, { style: BorderStyle.SINGLE, size: 8, color: 'C00000', space: 3 }])) }),
    ]),
    cap('裏（差出人）— 点線で切って、封筒の裏に貼る', 900),
    label(125, 48, { top: mm(8), bottom: mm(6), left: mm(12), right: mm(8) }, [
      P(t('〒　　　-　　　　', { size: 22 })),
      P(t('（住所）', { size: 24 }), { before: 40 }),
      P(t('ぼんぼやーじゅ通信の会', { size: 24 }), { before: 140 }),
      P(t('谷裏 弘晃', { size: 30 }), { before: 40 }),
    ]),
    ...(last ? [] : [new Paragraph({ children: [new PageBreak()] })]),
  ];
}

const KINDERGARTENS = [
  { zip: '187-0002', addr: '東京都小平市花小金井2-9-11', to: '小平花小金井幼稚園' },
  { zip: '187-0032', addr: '東京都小平市小川町1-2572', to: '小平神明幼稚園' },
];

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: mm(15), bottom: mm(15), left: mm(20), right: mm(20) } } },
    children: KINDERGARTENS.flatMap((k, i) => page(k, i === KINDERGARTENS.length - 1)),
  }],
});
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(__dirname + '/envelope-label.docx', buf);
  console.log('wrote docs/print/envelope-label.docx');
});
