/**
 * CalendarSkeleton — FullCalendar のローディングスケルトン
 *
 * Server Component（state/effect 不使用）
 */

export function CalendarSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* ツールバー */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-md bg-surface" />
          <div className="h-9 w-20 rounded-md bg-surface" />
          <div className="h-9 w-16 rounded-md bg-surface" />
        </div>
        <div className="h-8 w-48 rounded-md bg-surface" />
        <div className="flex gap-2">
          <div className="h-9 w-16 rounded-md bg-surface" />
          <div className="h-9 w-16 rounded-md bg-surface" />
          <div className="h-9 w-16 rounded-md bg-surface" />
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-8 rounded bg-surface" />
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="h-24 rounded bg-surface" />
        ))}
      </div>
    </div>
  );
}
