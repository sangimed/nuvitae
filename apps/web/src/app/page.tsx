import { bootstrapHealthSchema } from "@nuvitae/contracts";

export default function Home() {
  const health = bootstrapHealthSchema.parse({
    service: "web",
    status: "ok",
  });

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">Nuvitae bootstrap</p>
        <h1 id="page-title">Resume creation foundation</h1>
        <p>
          The application shell is running with the Docker-only workspace,
          shared contracts, API, worker, database, queue, and private storage
          boundaries ready for the next implementation phase.
        </p>
        <dl className="status-list">
          <div>
            <dt>Web</dt>
            <dd>{health.status}</dd>
          </div>
          <div>
            <dt>Import feature</dt>
            <dd>deferred</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
