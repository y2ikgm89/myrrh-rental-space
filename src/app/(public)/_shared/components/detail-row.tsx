import type { ReactNode } from "react";

export interface DetailRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * 予約 / イベント詳細ハブ共通の定義リスト行。
 * member 側 UGC (備考・長 URL 等) でも container を破らないよう wrap クラスを常に付与。
 */
export function DetailRow({ label, children }: DetailRowProps): ReactNode {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-none sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-36">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}
