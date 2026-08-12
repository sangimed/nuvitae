import PDFDocument from "pdfkit";
import yazl from "yazl";

export async function buildPdf(input: {
  readonly pages: readonly (readonly string[])[];
  readonly password?: string;
  readonly imageOnPages?: readonly number[];
}): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: false,
      compress: false,
      info: {
        CreationDate: new Date("2020-01-01T00:00:00.000Z"),
        ModDate: new Date("2020-01-01T00:00:00.000Z"),
        Producer: "synthetic-test-generator",
      },
      ...(input.password === undefined
        ? {}
        : {
            userPassword: input.password,
            ownerPassword: `${input.password}-owner`,
          }),
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.once("error", reject);
    document.once("end", () => resolve(Buffer.concat(chunks)));
    for (const [pageIndex, lines] of input.pages.entries()) {
      document.addPage({ size: "A4", margin: 72 });
      if (input.imageOnPages?.includes(pageIndex)) {
        document.image(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
          72,
          72,
          { width: 16, height: 16 },
        );
        document.moveDown();
      }
      for (const line of lines) {
        document.text(line);
      }
    }
    document.end();
  });
}

export type SyntheticPdfStructuralCase =
  | "uri"
  | "goto"
  | "javascript"
  | "launch"
  | "embedded_file"
  | "rich_media"
  | "unsupported_action"
  | "malformed_action";

/**
 * Minimal anonymous PDFs used to exercise structural safety classification.
 * The generated documents contain no user data and no external resources are
 * fetched by the tests or by the extraction adapter.
 */
export function buildStructuralPdf(input: {
  readonly cases: readonly SyntheticPdfStructuralCase[];
}): Uint8Array {
  const annotations = input.cases
    .map((kind, index) => {
      const action = structuralAction(kind);
      return `<< /Type /Annot /Subtype /Link /Rect [72 ${700 - index * 24} 300 ${720 - index * 24}] /A ${action} >>`;
    })
    .map((body, index) => ({ id: 6 + index, body }));
  const annotationReferences = annotations
    .map(({ id }) => `${id} 0 R`)
    .join(" ");
  const nextId = 6 + annotations.length;
  const featureBodies = input.cases.flatMap((kind) => {
    if (kind === "embedded_file") {
      return [
        {
          id: nextId,
          body: `<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream`,
        },
      ];
    }
    if (kind === "rich_media") {
      return [{ id: nextId, body: `<< /Type /RichMedia >>` }];
    }
    return [];
  });
  const featureReference = input.cases.includes("embedded_file")
    ? ` /Names << /EmbeddedFiles [(synthetic.bin) ${nextId} 0 R] >>`
    : input.cases.includes("rich_media")
      ? ` /RichMedia ${nextId} 0 R`
      : "";
  const content =
    "BT /F1 16 Tf 72 760 Td (Synthetic Candidate) Tj 0 -24 Td (Software Engineer) Tj 0 -24 Td (Professional Experience) Tj 0 -24 Td (Education and Skills) Tj 0 -24 Td (Built company project responsibilities with team work years) Tj ET";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R${featureReference} >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [${annotationReferences}] >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    ...annotations.map(({ body }) => body),
    ...featureBodies.map(({ body }) => body),
  ];
  const header = Buffer.from("%PDF-1.7\n%\xff\xff\xff\xff\n", "binary");
  const chunks = [header];
  const offsets = [0];
  let offset = header.byteLength;
  for (const [index, body] of objects.entries()) {
    const chunk = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "binary",
    );
    offsets.push(offset);
    chunks.push(chunk);
    offset += chunk.byteLength;
  }
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF\n",
  ].join("\n");
  chunks.push(Buffer.from(xref, "binary"));
  return new Uint8Array(Buffer.concat(chunks));
}

function structuralAction(kind: SyntheticPdfStructuralCase): string {
  switch (kind) {
    case "uri":
      return `<< /Type /Action /S /URI /URI (https://professional.example.test/profile) >>`;
    case "goto":
      return `<< /Type /Action /S /GoTo /D [3 0 R /Fit] >>`;
    case "javascript":
      return `<< /Type /Action /S /JavaScript /JS (synthetic) >>`;
    case "launch":
      return `<< /Type /Action /S /Launch /F (synthetic) >>`;
    case "unsupported_action":
      return `<< /Type /Action /S /Rendition /R (synthetic) >>`;
    case "malformed_action":
      return `<< /Type /Action /D [3 0 R /Fit] >>`;
    case "embedded_file":
    case "rich_media":
      return `<< /Type /Action /S /URI /URI (https://professional.example.test/resource) >>`;
  }
}

export async function buildDocx(input: {
  readonly documentXml?: string;
  readonly additionalEntries?: Readonly<Record<string, string | Uint8Array>>;
  readonly mainContentType?: string;
  readonly rootRelationshipTarget?: string;
}): Promise<Uint8Array> {
  const zip = new yazl.ZipFile();
  const mainContentType =
    input.mainContentType ??
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainContentType}"/></Types>`,
    ),
    "[Content_Types].xml",
  );
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${input.rootRelationshipTarget ?? "word/document.xml"}"/></Relationships>`,
    ),
    "_rels/.rels",
  );
  if (input.documentXml !== undefined) {
    zip.addBuffer(Buffer.from(input.documentXml), "word/document.xml");
  }
  for (const [name, value] of Object.entries(input.additionalEntries ?? {})) {
    zip.addBuffer(Buffer.from(value), name, { compress: true });
  }
  zip.end();
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

export const documentXml = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr/></w:body></w:document>`;

export const paragraphXml = (...runs: string[]): string =>
  `<w:p>${runs.map((run) => `<w:r>${run}</w:r>`).join("")}</w:p>`;
