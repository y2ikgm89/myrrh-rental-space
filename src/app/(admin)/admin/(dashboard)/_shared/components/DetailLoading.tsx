export default function DetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-20 rounded bg-muted" />
          <div className="h-10 w-20 rounded bg-muted" />
        </div>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-5 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
