import { ButtonLink, Panel, ProgressSteps } from "../components/community";
import { CommunityFunnelBeacon } from "../components/CommunityFunnelBeacon";

export const dynamic = "force-dynamic";

export default function Home() {
  const localPlayMode = process.env.NUVITAE_LOCAL_PLAY_MODE === "true";

  return (
    <main className="onboarding-shell">
      <CommunityFunnelBeacon />
      <section className="onboarding-intro" aria-labelledby="page-title">
        <p className="eyebrow">Your next opportunity starts here</p>
        <h1 id="page-title">Build a resume you feel good sending.</h1>
        <p className="onboarding-lede">
          Bring an existing resume or start fresh. You stay in control of every
          detail before you export.
        </p>
        {localPlayMode ? (
          <div className="local-banner" role="status">
            Local play mode uses one development identity. Data is stored in
            local Docker volumes and this is not production authentication.
          </div>
        ) : null}
        {!localPlayMode ? (
          <p className="onboarding-sign-in-note">
            Sign in from the header to save and return to your resumes.
          </p>
        ) : null}
      </section>

      <section className="onboarding-choices" aria-label="Choose how to start">
        <Panel className="onboarding-choice onboarding-choice-featured">
          <p className="onboarding-choice-kicker">Recommended</p>
          <h2>Import your existing resume</h2>
          <p>
            Upload a resume and use it as your starting point. Review what was
            found, make changes, then choose how it looks.
          </p>
          <ButtonLink href="/import-resume">Import a resume</ButtonLink>
        </Panel>
        <Panel className="onboarding-choice">
          <p className="onboarding-choice-kicker">Start fresh</p>
          <h2>Create a resume from scratch</h2>
          <p>
            Add your experience one section at a time with a guided editor and a
            live preview.
          </p>
          <ButtonLink href="/resumes/new/manual" variant="secondary">
            Create a resume
          </ButtonLink>
        </Panel>
      </section>

      <section
        className="onboarding-next"
        aria-labelledby="onboarding-next-title"
      >
        <h2 id="onboarding-next-title">
          A clear path from first draft to finished resume
        </h2>
        <ProgressSteps
          steps={[
            { label: "Add your details", status: "current" },
            { label: "Review and refine", status: "upcoming" },
            { label: "Preview and export", status: "upcoming" },
          ]}
        />
        <p>
          Your resume is kept private to your workspace. You decide when it is
          ready to download.
        </p>
      </section>
    </main>
  );
}
