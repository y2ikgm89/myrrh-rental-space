"use client";

import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";

/**
 * /mypage 系の一過性 flash notice (query-string 起点).
 *
 * - server render 時に prop で受けた `queryKey` が現在の URL に載っていれば
 *   一度だけ描画し, mount 直後に `history.replaceState` で query を除去する.
 * - reload / history back で banner が再描画されることは無い (once-per-nav).
 * - client-only な effect のため server render の HTML は banner を含む
 *   (SEO 影響ゼロ. crawler は mypage を辿らない.)
 *
 * variant: "success" (キャンセル完了等) / "notice" (要対応バナー).
 */
interface FlashMessageProps {
  readonly queryKey: string;
  readonly variant?: "success" | "notice";
  readonly children: ReactNode;
}

const VARIANT_CLASS: Record<
  NonNullable<FlashMessageProps["variant"]>,
  string
> = {
  success: "border-success/30 bg-success/5",
  notice: "border-accent/30 bg-accent/5",
};

export function FlashMessage({
  queryKey,
  variant = "success",
  children,
}: FlashMessageProps): ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(queryKey)) return;
    url.searchParams.delete(queryKey);
    const search = url.searchParams.toString();
    const newUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", newUrl);
  }, [queryKey]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative border p-4 pr-12 text-sm text-foreground ${VARIANT_CLASS[variant]}`}
    >
      {children}
      <button
        type="button"
        onClick={() => {
          setVisible(false);
        }}
        aria-label="通知を閉じる"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
