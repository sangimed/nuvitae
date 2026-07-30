import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
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

const directory = dirname(fileURLToPath(import.meta.url));
const textPath = resolve(directory, "anonymous-selectable-resume.txt");
const pdfPath = resolve(directory, "anonymous-selectable-resume.pdf");
const text = await readFile(textPath, "utf8");

const document = new PDFDocument({
  autoFirstPage: false,
  compress: false,
  info: {
    CreationDate: new Date("2020-01-01T00:00:00.000Z"),
    ModDate: new Date("2020-01-01T00:00:00.000Z"),
    Producer: "nuvitae-synthetic-fixture-generator",
    Creator: "nuvitae-synthetic-fixture-generator",
    Title: "Anonymous Selectable Resume Fixture",
  },
});

const chunks = [];
document.on("data", (chunk) => chunks.push(chunk));

const finished = new Promise((resolveFinished, rejectFinished) => {
  document.once("end", resolveFinished);
  document.once("error", rejectFinished);
});

document.addPage({ size: "A4", margin: 72 });
document.font("Helvetica-Bold").fontSize(16).text("ALEX MARTIN");
document.font("Helvetica").fontSize(12).text("Backend Engineer");
document.moveDown();

for (const line of text
  .split(/\r?\n/u)
  .slice(3)
  .filter((value) => value.length > 0)) {
  if (line.endsWith(":")) {
    document.moveDown(0.5);
    document.font("Helvetica-Bold").text(line);
  } else {
    document.font("Helvetica").text(line);
  }
}

document.end();
await finished;
await writeFile(pdfPath, Buffer.concat(chunks));
