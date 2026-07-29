import { ReviewFlow } from "../../../../features/import-resume/ReviewFlow";

export default async function ImportReviewPage({
  params,
}: {
  readonly params: Promise<{ readonly importId: string }>;
}) {
  const { importId } = await params;
  return (
    <main className="shell import-shell">
      <ReviewFlow importId={importId} />
    </main>
  );
}
