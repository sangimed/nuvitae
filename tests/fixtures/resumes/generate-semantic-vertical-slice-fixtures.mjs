import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PDFDocument = require(
  require.resolve("pdfkit", {
    paths: [
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../packages/extraction",
      ),
    ],
  }),
);
const yazl = require(
  require.resolve("yazl", {
    paths: [
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../packages/extraction",
      ),
    ],
  }),
);

const directory = dirname(fileURLToPath(import.meta.url));

const pdfLines = [
  "Jordan Avery",
  "jordan.avery@example.test",
  "Paris, France",
  "+33 6 12 34 56 78",
  "Senior Software Engineer",
  "Summary",
  "Backend engineer with six years of experience building distributed systems.",
  "Work Experience",
  "Nova Systems",
  "Senior Software Engineer",
  "2021 – Present",
  "Lead the payments platform team of eight engineers.",
  "Software Engineer",
  "2019 – 2021",
  "Built and operated the customer notification service.",
  "Education",
  "BSc Computer Science",
  "State University",
  "2015 – 2019",
  "Skills",
  "TypeScript, Go, PostgreSQL, Kubernetes, AWS",
  "Languages",
  "English (native), French (fluent)",
];

const docxLines = [
  "Maya Chen",
  "maya.chen@example.test",
  "Lyon, France",
  "Product Designer",
  "Summary",
  "Product designer focused on design systems and accessibility.",
  "Work Experience",
  "Acme Studio",
  "Product Designer",
  "2019/2021",
  "Shipped the design system used by twelve product teams.",
  "Bright Labs",
  "Senior Product Designer",
  "2022 – Present",
  "Lead design reviews and user research for the mobile app.",
  "Skills",
  "Figma, Prototyping, Design Systems, Accessibility",
  "Languages",
  "French (native), English (professional)",
  "Projects",
  "Open-source design tokens library",
  "Accessibility audit toolkit",
];

async function generatePdf() {
  const pdfPath = resolve(directory, "semantic-vertical-slice-jordan-avery.pdf");
  const document = new PDFDocument({
    autoFirstPage: false,
    compress: false,
    info: {
      CreationDate: new Date("2020-01-01T00:00:00.000Z"),
      ModDate: new Date("2020-01-01T00:00:00.000Z"),
      Producer: "nuvitae-synthetic-fixture-generator",
      Creator: "nuvitae-synthetic-fixture-generator",
      Title: "Anonymous Semantic Vertical Slice PDF Fixture",
    },
  });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolveFinished, rejectFinished) => {
    document.once("end", resolveFinished);
    document.once("error", rejectFinished);
  });
  document.addPage({ size: "A4", margin: 72 });
  document.fontSize(12);
  for (const line of pdfLines) document.text(line);
  document.end();
  await finished;
  await writeFile(pdfPath, Buffer.concat(chunks));
}

function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function generateDocx() {
  const docxPath = resolve(directory, "semantic-vertical-slice-maya-chen.docx");
  const zip = new yazl.ZipFile();
  zip.addBuffer(
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "[Content_Types].xml",
  );
  zip.addBuffer(
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "_rels/.rels",
  );
  const body = docxLines.map(paragraph).join("");
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    ),
    "word/document.xml",
  );
  await new Promise((resolveFinished, rejectFinished) => {
    zip.outputStream
      .pipe(createWriteStream(docxPath))
      .on("close", resolveFinished)
      .on("error", rejectFinished);
    zip.end();
  });
}

await generatePdf();
await generateDocx();
