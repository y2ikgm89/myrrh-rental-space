type MypageSkeletonProps = {
  readonly variant?: "list" | "detail" | "form";
};

/**
 * マイページ系 loading.tsx の共通プレースホルダ。
 * list: 3 件のカード型、detail: 大ブロック型、form: 入力欄型。
 * `aria-busy` + `aria-live="polite"` で SR にロード状態を通知。
 */
export function MypageSkeleton({ variant = "list" }: MypageSkeletonProps) {
  if (variant === "detail") {
    return (
      <div
        className="animate-pulse space-y-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-8 w-1/3 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div
        className="animate-pulse space-y-4"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-8 w-1/2 rounded bg-muted" />
        <div className="h-12 rounded bg-muted" />
        <div className="h-12 rounded bg-muted" />
        <div className="h-12 rounded bg-muted" />
        <div className="h-12 w-32 rounded bg-muted" />
      </div>
    );
  }

  // list (default)
  return (
    <div
      className="animate-pulse space-y-4"
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 border border-border p-5">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-6 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
