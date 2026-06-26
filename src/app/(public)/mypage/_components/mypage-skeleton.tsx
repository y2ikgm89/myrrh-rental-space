import { Skeleton } from "@/public/components/design-system/skeleton";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

type MypageSkeletonProps = {
  readonly variant?: "list" | "detail" | "form";
};

/**
 * マイページ系 loading.tsx の共通プレースホルダ。
 * list: 3 件のカード型、detail: 大ブロック型、form: 入力欄型。
 *
 * 全 7 mypage loading.tsx（`/mypage`, `/mypage/events`, `/mypage/inquiries`,
 * `/mypage/inquiries/[id]`, `/mypage/reservations/[id]`,
 * `/mypage/reservations/[id]/edit`, `/mypage/settings`）の SSoT。
 *
 * `aria-busy="true"` + `aria-live="polite"` で SR にロード状態を通知。
 * Skeleton primitive 経由で公開ページの `bg-surface` カラートークンに統一。
 */
export function MypageSkeleton({ variant = "list" }: MypageSkeletonProps) {
  if (variant === "detail") {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Skeleton className="h-8 w-1/3" variant="text" />
        <Skeleton className="h-48 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" variant="text" />
          <Skeleton className="h-4 w-11/12" variant="text" />
          <Skeleton className="h-4 w-4/5" variant="text" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (variant === "form") {
    // 実フォーム (edit-reservation-form / profile-form) は border / outer padding を
    // 持たない素の field stack 構造なので、skeleton も border / p-6 を撤去して
    // loading → loaded 遷移の CLS / フラッシュを抑える。
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Skeleton className="h-8 w-1/2" variant="text" />
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-11 w-full" />
          </div>
          <Skeleton className="h-12 w-full sm:w-32" />
        </div>
      </div>
    );
  }

  // list (default)
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {skeletonKeys(3, "mypage-card").map((key) => (
        <div key={key} className="space-y-3 border border-border p-5">
          <Skeleton className="h-3 w-24" variant="text" />
          <Skeleton className="h-6 w-2/3" variant="text" />
          <Skeleton className="h-4 w-1/3" variant="text" />
        </div>
      ))}
    </div>
  );
}
