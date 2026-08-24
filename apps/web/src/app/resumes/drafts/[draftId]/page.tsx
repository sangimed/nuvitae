import { ManualResumeFlow } from "../../../../features/manual-resume/ManualResumeFlow";

export default async function ManualResumeDraftPage({
  params,
}: {
  readonly params: Promise<{ readonly draftId: string }>;
}) {
  const { draftId } = await params;
  return (
    <main className="shell manual-shell">
      <ManualResumeFlow draftId={draftId} />
    </main>
  );
}
