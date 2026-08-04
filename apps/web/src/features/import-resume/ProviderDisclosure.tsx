"use client";

/**
 * T175 - provider requirement and provider-use disclosure.
 *
 * Plain-language, provider-neutral disclosure shown on the upload step before
 * any provider-backed processing starts. It never exposes provider
 * configuration, model names, prompts, OAuth implementation, credentials,
 * session references, storage paths, raw diagnostics, or internal capability
 * identifiers.
 */
export function ProviderDisclosure() {
  return (
    <div className="guidance-panel" aria-labelledby="provider-disclosure-title">
      <h2 id="provider-disclosure-title">AI analysis of your resume</h2>
      <ul>
        <li>
          Reliable analysis of your resume needs a connected, compatible AI
          provider.
        </li>
        <li>
          The provider receives only the text extracted from your resume, not
          access to anything else in Nuvitae.
        </li>
        <li>
          Provider-suggested fields stay unconfirmed until you review them.
        </li>
        <li>
          Before creating a draft, Nuvitae checks that suggestions follow the
          expected format, are backed by your document, and are not invented.
        </li>
        <li>
          If no usable AI provider is available, you can still use limited
          automatic extraction or enter your resume manually.
        </li>
        <li>
          Limited automatic extraction is partial. It may miss information and
          does not provide reliable full semantic parsing.
        </li>
      </ul>
    </div>
  );
}
