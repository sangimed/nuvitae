import { ConfirmedResumeView } from "../../../features/import-resume/ConfirmedResumeView";

export default async function ConfirmedResumePage({
  params,
}: {
  readonly params: Promise<{ readonly resumeId: string }>;
}) {
  const { resumeId } = await params;
  return (
    <main className="shell import-shell">
      <ConfirmedResumeView resumeId={resumeId} />
    </main>
  );
}
