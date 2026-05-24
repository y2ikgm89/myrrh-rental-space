import { Skeleton } from "@/admin/components/ui";

/**
 * Lexical エディタ系（posts / news / terms / pages）の共通ローディング UI。
 *
 * `InlineEditorShell` + `EditorHeader` の実 UI を反映:
 * - h-14 fixed top header (back button + title + save/preview/settings buttons)
 * - main content (toolbar + editable area + side inspector)
 */
export default function EditorLoading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      {/* Fixed top header (h-14) */}
      <div className="fixed inset-x-0 top-0 z-40 h-14 border-b bg-background/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-4">
          {/* Left: back + title */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-5 w-48" variant="text" />
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>

      {/* Content (offset by h-14 header) */}
      <div className="mt-14 flex flex-1">
        {/* Main editor area */}
        <div className="flex-1 px-10 py-6">
          {/* Toolbar */}
          <div className="mb-6 flex flex-wrap gap-1 border-b pb-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-9" />
            ))}
          </div>

          {/* Editable body */}
          <div className="mx-auto max-w-[var(--container-measure,65ch)] space-y-4">
            <Skeleton className="h-10 w-3/4" variant="text" />
            <div className="space-y-3 pt-2">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-5/6" variant="text" />
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-4/5" variant="text" />
            </div>
            <Skeleton className="h-7 w-2/3" variant="text" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" variant="text" />
              <Skeleton className="h-4 w-11/12" variant="text" />
              <Skeleton className="h-4 w-3/4" variant="text" />
            </div>
          </div>
        </div>

        {/* Right inspector sidebar (lg+, 420px) */}
        <aside className="hidden w-[420px] border-l bg-card p-6 lg:block">
          <div className="space-y-6">
            <Skeleton className="h-6 w-32" variant="text" />
            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" variant="text" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
