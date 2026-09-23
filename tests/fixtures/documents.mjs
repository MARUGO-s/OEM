// Small, synthetic documents generated for tests. No user documents or secrets.
import { Buffer } from "node:buffer";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = Buffer.from(name),
      data = Buffer.from(text),
      checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(path.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, path, data);
    central.push(entry, path);
    offset += local.length + path.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const rels = "http://schemas.openxmlformats.org/package/2006/relationships";
const office =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const types = "http://schemas.openxmlformats.org/package/2006/content-types";
const defaults =
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
const rootRel = (target) =>
  `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="${target}"/></Relationships>`;
export const docxBytes = zip({
  "[Content_Types].xml": `<Types xmlns="${types}">${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  "_rels/.rels": rootRel("word/document.xml"),
  "word/document.xml":
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>企画書：架空の新商品検証。計画上の開始日は10月1日。会議での承認前の案です。資料だけの提案：テレビ広告を出稿する。会議では未決定。</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
});
export const xlsxBytes = zip({
  "[Content_Types].xml": `<Types xmlns="${types}">${defaults}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  "_rels/.rels": rootRel("xl/workbook.xml"),
  "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="予算案" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/worksheets/sheet1.xml":
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>項目</t></is></c><c r="B1" t="inlineStr"><is><t>金額（円）</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>新商品検証の予算案</t></is></c><c r="B2"><v>800000</v></c></row></sheetData></worksheet>',
});
function pdf() {
  const content =
    "BT /F1 14 Tf 50 750 Td (Project test - draft schedule) Tj 0 -25 Td (Draft launch: October 1. Not yet approved.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(text);
}
export const pdfBytes = pdf();
export const documentFixtures = () => [
  new File([pdfBytes], "日程案.pdf", { type: "application/pdf" }),
  new File([docxBytes], "企画書.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  new File([xlsxBytes], "予算案.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }),
];
export const reviewFixture = (attachment) => ({
  attachmentId: attachment.id,
  relevance: "関連あり",
  summary: `${attachment.name}の架空の照合結果`,
  references: [
    {
      location: "見出し：企画案",
      documentEvidence: "開始日10月1日（案）",
      meetingEvidence: "10月15日に決定",
      interpretation: "会話で変更。資料案とは日程が異なる。",
    },
  ],
  conflicts: ["資料案10月1日と会話の決定10月15日の相違"],
  limitations: [],
});
