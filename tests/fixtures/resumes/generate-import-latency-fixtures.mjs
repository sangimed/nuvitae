import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const output = resolve(directory, "anonymous-realistic-2-page-resume.pdf");

const pages = [
  [
    "Morgan Example",
    "morgan.example@example.test",
    "Lyon, France | +33 4 00 00 00 00",
    "",
    "Product Systems Engineer",
    "Anonymous two-page resume fixture for deterministic import latency measurement.",
    "",
    "Experience",
    "Example Platform - Senior Product Systems Engineer - 2021-Present",
    "Designed bounded workflow services and documented operational behavior for fictional teams.",
    "Built deterministic validation checks for 240 synthetic records and reduced review ambiguity.",
    "Example Tools - Systems Engineer - 2018-2021",
    "Implemented internal reporting tools with TypeScript, PostgreSQL, and reliable background jobs.",
    "Coordinated releases across three fictional product groups and maintained clear source records.",
    "",
    "Education",
    "Master of Computer Systems - Example Institute - 2016-2018",
    "Bachelor of Information Science - Example University - 2013-2016",
    "",
    "Skills",
    "TypeScript, Node.js, PostgreSQL, Docker, accessibility testing, data modeling",
    "Documentation, service design, privacy review, deterministic validation",
    "",
    "Languages",
    "French (professional), English (professional)",
  ],
  [
    "Selected Projects",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `Synthetic project ${index + 1}: created a privacy-safe workflow experiment with explicit evidence and reviewable outcomes.`,
    ),
    "",
    "Certifications",
    "Fictional certification in reliable document workflows - 2024",
    "Fictional accessibility review certificate - 2023",
    "",
    "Additional Information",
    "This fixture contains no real person, employer, address, credential, or contact information.",
    "Every value is synthetic and exists only for repeatable local measurements.",
  ],
];

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  `<< /Type /Pages /Kids [3 0 R 5 0 R] /Count ${pages.length} >>`,
];
for (let index = 0; index < pages.length; index += 1) {
  const pageObject = 3 + index * 2;
  const contentObject = pageObject + 1;
  const stream = pageContent(pages[index]);
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents ${contentObject} 0 R >>`,
  );
  objects.push(
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
  );
}
objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
const offsets = [0];
for (let index = 0; index < objects.length; index += 1) {
  offsets.push(Buffer.concat(chunks).byteLength);
  chunks.push(
    Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "ascii"),
  );
}
const xrefOffset = Buffer.concat(chunks).byteLength;
chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n`, "ascii"));
chunks.push(Buffer.from("0000000000 65535 f \n", "ascii"));
for (const offset of offsets.slice(1)) {
  chunks.push(
    Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "ascii"),
  );
}
chunks.push(
  Buffer.from(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    "ascii",
  ),
);
await writeFile(output, Buffer.concat(chunks));

function pageContent(lines = []) {
  const commands = ["BT", "/F1 10 Tf", "58 780 Td", "14 TL"];
  for (const line of lines) {
    commands.push(`(${escapePdfText(line)}) Tj`, "T*");
  }
  commands.push("ET");
  return commands.join("\n");
}

function escapePdfText(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}
