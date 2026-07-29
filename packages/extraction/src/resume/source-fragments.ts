import type {
  DocxParagraph,
  DocxTextRun,
  PdfPageText,
  PdfTextItem,
  DeterministicSourceLocation,
  ExtractionDocumentFormat,
} from "../adapters.js";

export interface ResumeSourceFragment {
  readonly text: string;
  readonly order: number;
  readonly format: ExtractionDocumentFormat;
  readonly location: DeterministicSourceLocation;
  readonly context?: "paragraph" | "table_cell";
}

export function fragmentsFromPdf(
  pages: readonly PdfPageText[],
): readonly ResumeSourceFragment[] {
  return pages.flatMap((page) =>
    page.items.map((item: PdfTextItem) => ({
      text: item.text,
      order: item.provenance.readingOrder,
      format: "pdf" as const,
      location: item.provenance,
    })),
  );
}

export function fragmentsFromDocx(
  paragraphs: readonly DocxParagraph[],
): readonly ResumeSourceFragment[] {
  return paragraphs.flatMap((paragraph) =>
    paragraph.runs.map((run: DocxTextRun) => ({
      text: run.text,
      order: run.provenance.readingOrder,
      format: "docx" as const,
      location: run.provenance,
      context: "paragraph" as const,
    })),
  );
}
