export const SECRET_PATTERNS = Object.freeze([
  /sk-[A-Za-z0-9_-]{16,}/g,
  /access[_-]?token["'=:\s]+[A-Za-z0-9._~+/=-]{12,}/gi,
  /refresh[_-]?token["'=:\s]+[A-Za-z0-9._~+/=-]{12,}/gi,
  /id[_-]?token["'=:\s]+[A-Za-z0-9._~+/=-]{12,}/gi,
  /authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /code=[A-Za-z0-9._~+/=-]{8,}/gi,
  /code_verifier["'=:\s]+[A-Za-z0-9._~-]{20,}/gi,
  /state=[A-Za-z0-9._~-]{16,}/gi,
  /https?:\/\/[^ \n\r]+\/auth\/callback\?[^ \n\r]+/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
]);

export function containsSecretLikeValue(text) {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function sanitizeErrorCategory(value) {
  const text = String(value ?? "");
  if (!text) {
    return "unknown";
  }
  return text.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
}
