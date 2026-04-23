import { Skeleton } from "@/admin/components/ui/skeleton";

const STYLE_SKELETON_KEYS = [
  "style-skeleton-1",
  "style-skeleton-2",
  "style-skeleton-3",
  "style-skeleton-4",
  "style-skeleton-5",
  "style-skeleton-6",
] as const;

export default function StylesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-[180px]" />
        <Skeleton className="h-10 w-full sm:w-[180px]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STYLE_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-52 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
