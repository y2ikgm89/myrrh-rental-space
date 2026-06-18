import type { ReactElement } from "react";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

interface MaintenancePageProps {
  message?: string | null;
}

const DEFAULT_MESSAGE =
  "システムの改善作業のため、一時的にサービスを停止しております。\nしばらくお待ちください。";

export function MaintenancePage({
  message,
}: MaintenancePageProps): ReactElement {
  const displayMessage = message ?? DEFAULT_MESSAGE;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 md:px-8">
      <div className="animate-maintenance-in w-full max-w-sm text-center">
        {/* ブランドロゴ */}
        <p className="font-heading text-xl tracking-eyebrow text-foreground">
          {SITE_DEFAULTS.name.split(" ")[0]?.toUpperCase() ?? "MYRRH"}
        </p>

        {/* MAINTENANCE ラベル */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-accent" aria-hidden="true" />
          <span className="text-eyebrow uppercase text-muted-foreground">
            Maintenance
          </span>
          <span className="h-px w-8 bg-accent" aria-hidden="true" />
        </div>

        {/* 見出し */}
        <h1 className="mt-6 font-heading text-2xl font-light tracking-tight text-foreground sm:text-3xl">
          只今メンテナンス中です
        </h1>

        {/* メッセージ */}
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {displayMessage}
        </p>

        {/* 区切り線 */}
        <div
          className="mx-auto mt-8 w-12 border-t border-border"
          aria-hidden="true"
        />

        {/* フッターノート */}
        <p className="mt-6 text-xs text-muted-foreground/60">
          ご不便をおかけして申し訳ございません
        </p>
      </div>
    </div>
  );
}
