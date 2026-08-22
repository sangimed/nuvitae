import PDFDocument from "pdfkit";

import type { RenderableResume } from "../content-factory.js";
import type { ResumeFixtureSpec } from "../fixture-spec.js";

const fixedDate = new Date("2020-01-01T00:00:00.000Z");
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function renderPdf(
  spec: ResumeFixtureSpec,
  content: RenderableResume,
): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: false,
      compress: false,
      info: {
        CreationDate: fixedDate,
        ModDate: fixedDate,
        Creator: spec.rendererVersion,
        Producer: spec.rendererVersion,
        Title: `${spec.fixtureId};seed=${spec.seed}`,
      },
      ...(spec.mutation === "password_protected"
        ? { userPassword: "fixture", ownerPassword: "fixture-owner" }
        : {}),
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.once("error", reject);
    document.once("end", () => resolve(Buffer.concat(chunks)));
    document.addPage({ size: "A4", margin: 46 });

    if (spec.mutation === "image_only") {
      document.image(pixel, 46, 46, { width: 500, height: 700 });
      document.end();
      return;
    }

    document.font("Helvetica-Bold").fontSize(18).text(content.heading);
    document.font("Helvetica").fontSize(8).text(content.contactLine);
    document.moveDown(0.7);
    if (spec.mutation === "mixed_text_image") {
      document.image(pixel, 475, 46, { width: 72, height: 72 });
    }

    if (
      spec.layout === "two_column" ||
      spec.layout === "three_column_sidebar"
    ) {
      renderColumns(
        document,
        content,
        spec.layout === "three_column_sidebar" ? 3 : 2,
      );
    } else {
      renderOneColumn(document, content, spec.layout === "dense_one_column");
    }
    if (spec.layout === "header_footer") {
      document
        .font("Helvetica-Oblique")
        .fontSize(7)
        .text("Synthetic corpus · example.test", 46, 800, { align: "center" });
    }
    document.end();
  });
}

function renderOneColumn(
  document: PDFKit.PDFDocument,
  content: RenderableResume,
  dense: boolean,
): void {
  document.fontSize(dense ? 7 : 9);
  for (const section of content.sections) {
    document.moveDown(dense ? 0.2 : 0.55);
    document.font("Helvetica-Bold").text(section.heading.toUpperCase());
    document.font("Helvetica");
    for (const line of section.lines)
      document.text(line, { lineGap: dense ? 0 : 2 });
  }
}

function renderColumns(
  document: PDFKit.PDFDocument,
  content: RenderableResume,
  count: 2 | 3,
): void {
  const width = count === 2 ? 238 : 154;
  const gap = 14;
  const startY = document.y;
  for (const [index, section] of content.sections.entries()) {
    const column = index % count;
    const row = Math.floor(index / count);
    const x = 46 + column * (width + gap);
    const y = startY + row * 250;
    document
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(section.heading.toUpperCase(), x, y, {
        width,
      });
    document.font("Helvetica").fontSize(7.5);
    let lineY = y + 14;
    for (const line of section.lines) {
      document.text(line, x, lineY, { width, lineGap: 1 });
      lineY = document.y + 2;
    }
  }
}
