"use client";

/**
 * 顧客ログアウトボタン — Better Auth 公式推奨パターン準拠
 *
 * - `signOut({ fetchOptions: { onSuccess } })` で Set-Cookie による session 破棄後に redirect
 * - `router.refresh()` で PPR の server-side session キャッシュを無効化
 * - variant で site-header の desktop/mobile スタイルに追従（CLAUDE.md の tracking/uppercase トークン統一）
 *
 * @see https://www.better-auth.com/docs/basic-usage#sign-out-user
 * @see https://web.dev/articles/sign-out-best-practices
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconLogout } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { signOut } from "@/shared/lib/customer-auth-client";
import { getErrorMessage } from "@/shared/lib/errors";

export type LogoutButtonVariant = "desktop-nav" | "mobile-nav";

interface LogoutButtonProps {
  readonly variant: LogoutButtonVariant;
  /** mobile Dialog 等、クリック時に同時に閉じたい親の副作用 */
  readonly onBeforeLogout?: () => void;
}

const VARIANT_CLASS: Record<LogoutButtonVariant, string> = {
  "desktop-nav":
    "relative inline-flex items-center gap-1.5 whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 disabled:opacity-50",
  "mobile-nav":
    "inline-flex items-center gap-2 border border-border px-5 py-2.5 font-heading text-base font-light italic tracking-[0.08em] text-foreground transition-colors hover:border-foreground hover:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none disabled:opacity-50",
};

const ICON_CLASS: Record<LogoutButtonVariant, string> = {
  "desktop-nav": "h-3.5 w-3.5",
  "mobile-nav": "h-4 w-4",
};

export function LogoutButton({ variant, onBeforeLogout }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLogout = () => {
    if (isPending) return;
    setIsPending(true);
    onBeforeLogout?.();

    startTransition(async () => {
      try {
        await signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push("/");
              router.refresh();
            },
          },
        });
      } catch (cause) {
        console.error("Failed to sign out", getErrorMessage(cause));
        setIsPending(false);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      aria-busy={isPending}
      className={cn(VARIANT_CLASS[variant])}
    >
      {isPending ? (
        <IconLoader2
          className={cn(ICON_CLASS[variant], "animate-spin")}
          aria-hidden="true"
        />
      ) : (
        <IconLogout className={ICON_CLASS[variant]} aria-hidden="true" />
      )}
      <span>ログアウト</span>
      {isPending && <span className="sr-only">中</span>}
    </button>
  );
}
