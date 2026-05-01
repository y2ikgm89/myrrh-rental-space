import "server-only";
import type { ReactElement } from "react";
import { getIntegrationHealthSummary } from "@/shared/domain/settings/api-key-queries";
import {
  IntegrationHealthAlertClient,
  type IntegrationHealthAlertItem,
} from "./IntegrationHealthAlertClient";

type IntegrationKey = "resend" | "stripe" | "googleCalendar" | "turnstile";

const INTEGRATIONS: ReadonlyArray<
  IntegrationHealthAlertItem & { readonly key: IntegrationKey }
> = [
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
 * 主要外部連携の未設定状況を通知する alert（Server Component）。
 * 全て接続済なら null を返し何も表示しない。
 *
 * 配置: 設定トップ（/admin/settings）でのみ表示。dashboard top では非表示。
 * dismiss: Client 側で localStorage に未設定リストの signature を保存し、
 *          同じ未設定状態は再表示しない。新たな未設定が増えたら自動で再表示される。
 */
export async function IntegrationHealthAlert(): Promise<ReactElement | null> {
  const health = await getIntegrationHealthSummary();
  const disconnected = INTEGRATIONS.filter((i) => !health[i.key]);
  if (disconnected.length === 0) return null;

  return <IntegrationHealthAlertClient items={disconnected} />;
}
