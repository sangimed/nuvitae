import yazl from "yazl";

import type { RenderableResume } from "../content-factory.js";
import type { ResumeFixtureSpec } from "../fixture-spec.js";

const fixedMtime = new Date("2020-01-01T00:00:00.000Z");
const mainContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

export async function renderDocx(
  spec: ResumeFixtureSpec,
  content: RenderableResume,
): Promise<Uint8Array> {
  const zip = new yazl.ZipFile();
  add(
    zip,
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainContentType}"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
  );
  add(
    zip,
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  add(
    zip,
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
  );
  add(
    zip,
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(content.contactLine, true)}</w:hdr>`,
  );
  add(
    zip,
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(`${spec.fixtureId} · seed ${spec.seed} · synthetic`, false)}</w:ftr>`,
  );
  add(zip, "word/document.xml", documentXml(spec, content));
  zip.end();
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

function documentXml(
  spec: ResumeFixtureSpec,
  content: RenderableResume,
): string {
  const orderedSections =
    spec.layout === "reordered_sections"
      ? [...content.sections].reverse()
      : content.sections;
  const body =
    spec.layout === "docx_table"
      ? tableBody(content, orderedSections)
      : [
          paragraph(content.heading, true, 34),
          paragraph(content.contactLine, false),
          ...orderedSections.flatMap((section) => [
            paragraph(section.heading, true, 24),
            ...section.lines.map((line) => paragraph(line, false)),
          ]),
        ].join("");
  const pageBreaks =
    spec.mutation === "over_page_limit"
      ? Array.from({ length: 6 }, (_, index) =>
          paragraph(`Synthetic continuation page ${index + 2}`, true, 24, true),
        ).join("")
      : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${pageBreaks}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>`;
}

function tableBody(
  content: RenderableResume,
  sections: RenderableResume["sections"],
): string {
  const midpoint = Math.ceil(sections.length / 2);
  const cells = [sections.slice(0, midpoint), sections.slice(midpoint)].map(
    (group) =>
      `<w:tc><w:tcPr><w:tcW w:w="4900" w:type="dxa"/></w:tcPr>${group
        .flatMap((section) => [
          paragraph(section.heading, true, 24),
          ...section.lines.map((line) => paragraph(line, false)),
        ])
        .join("")}</w:tc>`,
  );
  return `${paragraph(content.heading, true, 34)}${paragraph(content.contactLine, false)}<w:tbl><w:tblPr><w:tblW w:w="9800" w:type="dxa"/></w:tblPr><w:tr>${cells.join("")}</w:tr></w:tbl>`;
}

function paragraph(
  text: string,
  bold: boolean,
  halfPoints = 18,
  pageBreakBefore = false,
): string {
  return `<w:p>${pageBreakBefore ? "<w:pPr><w:pageBreakBefore/></w:pPr>" : ""}<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${halfPoints}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function add(zip: yazl.ZipFile, name: string, value: string): void {
  zip.addBuffer(Buffer.from(value), name, {
    compress: true,
    mtime: fixedMtime,
    mode: 0o100644,
  });
}
