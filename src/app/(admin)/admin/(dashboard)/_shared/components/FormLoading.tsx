import { Skeleton } from "@/admin/components/ui";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

/**
 * 管理画面 新規作成・編集ページの共通フォームローディング UI。
 *
 * `AdminDetailLayout` の実 UI を反映: back button → header → 2-column form cards。
 * 全 form 系 loading.tsx の SSoT。Lexical エディタ系（posts / news / terms）は
 * 別 SSoT `EditorLoading` を使用する。
 */
export default function FormLoading() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="読み込み中"
    >
      {/* Back button */}
      <Skeleton className="h-9 w-32" />

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" variant="text" />
          <Skeleton className="h-4 w-48" variant="text" />
        </div>
      </div>

      {/* Form fields (2-column on sm+) */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {skeletonKeys(6, "form-field-primary").map((key) => (
              <div key={key} className="space-y-2">
                <Skeleton className="h-3 w-24" variant="text" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
          {/* Textarea row */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>

      {/* Secondary card (e.g., 詳細情報 / SEO) */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-5">
          <Skeleton className="h-6 w-32" variant="text" />
          <div className="grid gap-6 sm:grid-cols-2">
            {skeletonKeys(4, "form-field-secondary").map((key) => (
              <div key={key} className="space-y-2">
                <Skeleton className="h-3 w-24" variant="text" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Submit button row */}
      <div className="flex justify-end gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-32" />
      </div>
    </div>
  );
}
