export default function WorkflowsLoading() {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-muted/70" />
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card p-6" />
        ))}
      </div>
    </div>
  );
}
