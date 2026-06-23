// About page.

export function AboutPage() {
  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>About NMC Portal</h2>
      <div className="card">
        <p>Network Monitoring Center — internal operations portal.</p>
        <ul>
          <li>Built on the <code>@nmc/ai</code>, <code>@nmc/api-client</code>, <code>@nmc/store</code>, and <code>@nmc/ui</code> workspace packages.</li>
          <li>Fastify server, SQLite via Knex, JWT auth, OpenTelemetry traces.</li>
          <li>React 18 + Vite + TypeScript strict mode.</li>
        </ul>
      </div>
    </div>
  );
}
