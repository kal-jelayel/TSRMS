"use client";

export default function ContingencyNotice({ data }) {
  return (
    <aside className="card p-4 text-sm" role="status" aria-live="polite">
      <p>{data.status === "ready" ? "Live data ready." : data.status === "loading" ? "Loading live data. Changes are disabled." : data.status === "stale" ? "Stale data — read-only. Changes are disabled." : "Data unavailable. Changes are disabled."}</p>
      {data.refreshedAt && <p>Last successful refresh: {new Date(data.refreshedAt).toLocaleString()}</p>}
      {data.snapshot && data.status === "loading" && <p>Previously loaded data is stale until refresh completes.</p>}
      {data.error && <p>{data.error}</p>}
      <button type="button" className="mt-2 underline disabled:opacity-50" disabled={data.status === "loading" || data.busy} onClick={data.refresh}>Refresh live data</button>
    </aside>
  );
}
