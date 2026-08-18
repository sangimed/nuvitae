import { bootstrapHealthSchema } from "@nuvitae/contracts";
import Link from "next/link";
import { CommunityOwnerAccess } from "../features/community-auth/CommunityOwnerAccess";

export const dynamic = "force-dynamic";

export default function Home() {
  const health = bootstrapHealthSchema.parse({
    service: "web",
    status: "ok",
  });
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";

  return (
    <main className="shell">
      <section className="panel home-panel" aria-labelledby="page-title">
        <p className="eyebrow">Nuvitae Community</p>
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
          <>
            <p>
              Owner access is required. Your installation generated the owner
              access secret; retrieve it with{" "}
              <code>sh scripts/community-owner-secret.sh</code>. Local Play is a
              development mode, not Community production mode.
            </p>
            <CommunityOwnerAccess />
          </>
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
        <dl className="status-list">
          <div>
            <dt>Web</dt>
            <dd>{health.status}</dd>
          </div>
          <div>
            <dt>API route</dt>
            <dd>/api</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
