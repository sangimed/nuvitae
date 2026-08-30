import { ImportFlow } from "../../../features/import-resume/ImportFlow";

export default async function RecoverImportResumePage({
  params,
}: {
  readonly params: Promise<{ readonly importId: string }>;
}) {
  const { importId } = await params;
  return (
    <main className="shell import-shell">
      <ImportFlow importId={importId} />
    </main>
  );
}
