import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * Owner-scoped read-only persistence verification for the T211 vertical slice.
 *
 * These helpers only read counts/status needed to prove invariants that are
 * not publicly observable through the product API (exactly one import draft,
 * exactly one structured resume per confirmed source draft, no draft when the
 * provider is absent). They never write state and never log resume text or
 * personal values. The PostgreSQL configuration mirrors the shared persistence
 * environment boundary used by the API and worker.
 */

const require = createRequire(__filename);

interface PgClient {
  connect(): Promise<void>;
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly { [key: string]: unknown }[] }>;
  end(): Promise<void>;
}

function loadPgClient(): new (options: Record<string, unknown>) => PgClient {
  const pg = require(
    require.resolve("pg", {
      paths: [resolve(process.cwd(), "packages/persistence"), process.cwd()],
    }),
  ) as { Client: new (options: Record<string, unknown>) => PgClient };
  return pg.Client;
}

export interface VerticalSliceImportInvariants {
  readonly processingStatus: string | null;
  readonly draftCount: number;
  readonly structuredResumeCount: number;
}

export async function readImportInvariants(
  importId: string,
): Promise<VerticalSliceImportInvariants> {
  const client = new (loadPgClient())({
    host: process.env.POSTGRES_HOST ?? "postgres",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    user: process.env.POSTGRES_USER ?? "nuvitae",
    password: process.env.POSTGRES_PASSWORD ?? "nuvitae_dev_password",
    database: process.env.POSTGRES_DB ?? "nuvitae",
    ssl: process.env.POSTGRES_SSL === "true",
  });
  await client.connect();
  try {
    const ownerUserId = localPlayOwnerUserId();
    const documentResult = await client.query(
      "SELECT processing_status FROM imported_documents WHERE id = $1 AND owner_user_id = $2",
      [importId, ownerUserId],
    );
    const draftResult = await client.query(
      "SELECT count(*)::int AS n FROM import_drafts WHERE imported_document_id = $1 AND owner_user_id = $2",
      [importId, ownerUserId],
    );
    const resumeResult = await client.query(
      `SELECT count(*)::int AS n
         FROM structured_resumes sr
         JOIN import_drafts d
           ON d.id = sr.source_import_draft_id
          AND d.owner_user_id = sr.owner_user_id
        WHERE d.imported_document_id = $1
          AND d.owner_user_id = $2`,
      [importId, ownerUserId],
    );
    const processingStatus =
      documentResult.rows[0]?.processing_status === undefined
        ? null
        : String(documentResult.rows[0].processing_status);
    return {
      processingStatus,
      draftCount: Number(draftResult.rows[0]?.n ?? 0),
      structuredResumeCount: Number(resumeResult.rows[0]?.n ?? 0),
    };
  } finally {
    await client.end();
  }
}

function localPlayOwnerUserId(): string {
  return (
    process.env.LOCAL_PLAY_USER_ID ?? "00000000-0000-4000-8000-000000000101"
  );
}
