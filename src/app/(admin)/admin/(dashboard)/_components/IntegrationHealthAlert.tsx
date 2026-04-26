import "server-only";
import type { ReactElement } from "react";
import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { getIntegrationHealthSummary } from "@/shared/domain/settings/api-key-queries";

type IntegrationKey = "resend" | "stripe" | "googleCalendar" | "turnstile";

const INTEGRATIONS: ReadonlyArray<{
  readonly key: IntegrationKey;
  readonly label: string;
  readonly href: "/admin/settings/notify" | "/admin/settings/api";
}> = [
  {
    key: "resend",
    label: "Resend（メール送信）",
    href: "/admin/settings/notify",
  },
  { key: "stripe", label: "Stripe（決済）", href: "/admin/settings/api" },
  {
    key: "googleCalendar",
    label: "Google Calendar（予約同期）",
    href: "/admin/settings/api",
  },
  {
    key: "turnstile",
    label: "Cloudflare Turnstile（フォーム保護）",
    href: "/admin/settings/api",
  },
];

/**
 * 主要外部連携の未設定状況を dashboard 上部に通知する alert（Server Component）。
 * 全て接続済なら null を返し何も表示しない。streaming で遅延を許容するため
 * Suspense 境界内に配置する。
 */
export async function IntegrationHealthAlert(): Promise<ReactElement | null> {
  const health = await getIntegrationHealthSummary();
  const disconnected = INTEGRATIONS.filter((i) => !health[i.key]);
  if (disconnected.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"
    >
      <IconAlertTriangle
        className="h-5 w-5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="flex-1">
        <h2 className="font-medium text-foreground">
          未設定の外部連携が {disconnected.length} 件あります
        </h2>
        <p className="mt-1 text-muted-foreground">
          以下の連携を設定すると関連機能が有効になります。
        </p>
        <ul className="mt-3 space-y-1.5">
          {disconnected.map((integration) => (
            <li key={integration.key}>
              <Link
                href={integration.href}
                className="text-foreground underline underline-offset-4 hover:text-accent"
              >
                {integration.label}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">未設定</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
