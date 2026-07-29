import PDFDocument from "pdfkit";
import yazl from "yazl";

export async function buildPdf(input: {
  readonly pages: readonly (readonly string[])[];
  readonly password?: string;
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
    for (const lines of input.pages) {
      document.addPage({ size: "A4", margin: 72 });
      for (const line of lines) {
        document.text(line);
      }
    }
    document.end();
  });
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
