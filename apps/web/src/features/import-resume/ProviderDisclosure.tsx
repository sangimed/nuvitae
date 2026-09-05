"use client";

/**
 * T175/T213 - Codex requirement and provider-use disclosure.
 *
 * Plain-language disclosure shown on the upload step before Codex-backed
 * processing starts. It never exposes implementation details.
 */
export function ProviderDisclosure() {
  return (
    <div className="guidance-panel" aria-labelledby="provider-disclosure-title">
      <h2 id="provider-disclosure-title">How Codex helps with your import</h2>
      <ul>
        <li>Codex needs to be connected for the most complete import.</li>
        <li>
          Codex receives only the text from your resume, not access to anything
          else in Nuvitae.
        </li>
        <li>Nothing is saved to your resume until you review it.</li>
        <li>
          Nuvitae checks suggestions against your document and leaves out
          anything that cannot be verified.
        </li>
        <li>
          If Codex is unavailable, you can use a limited import that may miss
          information, or enter your details manually.
        </li>
      </ul>
    </div>
  );
}
