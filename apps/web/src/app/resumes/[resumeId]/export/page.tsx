import { ResumeExportView } from "../../../../features/resume-export/ResumeExportView";

export default async function ResumeExportPage({
  params,
}: {
  readonly params: Promise<{ readonly resumeId: string }>;
}) {
  const { resumeId } = await params;
  return (
    <main className="shell resume-export-shell">
      <ResumeExportView resumeId={resumeId} />
    </main>
  );
}
