export default function ResourceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-10 w-28 rounded bg-muted" />
      </div>
      <div className="h-10 w-full max-w-sm rounded bg-muted" />
      <div className="rounded-lg border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
