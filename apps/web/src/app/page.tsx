import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";

  return (
    <main className="shell">
      <section className="panel home-panel" aria-labelledby="page-title">
        <p className="eyebrow">Home</p>
        <h1 id="page-title">Create your resume</h1>
        <p>
          Start from an existing resume or create a structured draft manually.
        </p>
        {localPlayMode ? (
          <div className="local-banner" role="status">
            Local play mode uses one development identity. Data is stored in
            local Docker volumes and this is not production authentication.
          </div>
        ) : null}
        {!localPlayMode ? (
          <p>
            Owner access is required. Your installation generated the owner
            access secret; retrieve it with{" "}
            <code>sh scripts/community-owner-secret.sh</code>, then sign in from
            the application header.
          </p>
        ) : null}
        <div className="choice-grid">
          <Link className="primary-action" href="/import-resume">
            Import an existing resume
          </Link>
          <Link className="secondary-action" href="/resumes/new/manual">
            Create a resume manually
          </Link>
        </div>
        {!localPlayMode ? (
          <p>
            After signing in, create a resume manually or import one. Codex can
            be connected from the import flow.
          </p>
        ) : null}
      </section>
    </main>
  );
}
