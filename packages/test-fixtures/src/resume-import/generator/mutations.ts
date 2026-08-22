import type { ResumeFixtureSpec } from "./fixture-spec.js";

const maximumUploadBytes = 10 * 1024 * 1024;

export function applyMutation(
  spec: ResumeFixtureSpec,
  rendered: Uint8Array,
): Uint8Array {
  switch (spec.mutation) {
    case "malformed":
      return Buffer.from(
        "%PDF-1.7\nsynthetic malformed fixture\n%%EOF\n",
        "ascii",
      );
    case "corrupted":
      return renameDocxMainPart(rendered);
    case "oversized": {
      const result = Buffer.alloc(maximumUploadBytes + 1, 0x20);
      Buffer.from(rendered).copy(result);
      return result;
    }
    case "none":
    case "over_page_limit":
    case "password_protected":
    case "image_only":
    case "mixed_text_image":
      return rendered;
  }
}

function renameDocxMainPart(rendered: Uint8Array): Uint8Array {
  const result = Buffer.from(rendered);
  const original = Buffer.from("word/document.xml");
  const replacement = Buffer.from("word/mocument.xml");
  let offset = 0;
  let replacements = 0;
  while ((offset = result.indexOf(original, offset)) !== -1) {
    replacement.copy(result, offset);
    offset += replacement.length;
    replacements += 1;
  }
  if (replacements < 2)
    throw new Error("Unable to locate DOCX main part entries");
  return result;
}
