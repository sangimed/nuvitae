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
      <h2 id="provider-disclosure-title">AI analysis of your resume</h2>
      <ul>
        <li>Reliable analysis of your resume needs Codex to be connected.</li>
        <li>
          Codex receives only the text extracted from your resume, not access to
          anything else in Nuvitae.
        </li>
        <li>Suggested fields stay unconfirmed until you review them.</li>
        <li>
          Before creating a draft, Nuvitae checks that suggestions follow the
          expected format, are backed by your document, and are not invented.
        </li>
        <li>
          If Codex is not available, you can still use limited automatic
          extraction or enter your resume manually.
        </li>
        <li>
          Limited automatic extraction is partial. It may miss information and
          does not provide a reliable complete analysis.
        </li>
      </ul>
    </div>
  );
}
