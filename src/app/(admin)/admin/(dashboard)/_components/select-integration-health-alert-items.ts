import type { IntegrationHealthAlertItem } from "./IntegrationHealthAlertClient";

type IntegrationHealth = {
  readonly resend: boolean;
  readonly stripe: boolean;
  readonly googleCalendar: boolean;
  readonly turnstile: boolean;
  readonly switchbot: boolean;
};

type CoreIntegrationKey = "resend" | "stripe" | "googleCalendar" | "turnstile";

const CORE_INTEGRATIONS: ReadonlyArray<
  IntegrationHealthAlertItem & { readonly key: CoreIntegrationKey }
> = [
  {
    key: "resend",
    label: "Resend（メール送信）",
    href: "/admin/settings/integrations?tab=resend",
  },
  {
    key: "stripe",
    label: "Stripe（決済）",
    href: "/admin/settings/billing?tab=payment",
  },
  {
    key: "googleCalendar",
    label: "Google Calendar（予約同期）",
    href: "/admin/settings/integrations?tab=calendar",
  },
  {
    key: "turnstile",
    label: "Cloudflare Turnstile（フォーム保護）",
    href: "/admin/settings/integrations?tab=turnstile",
  },
];

const SWITCHBOT_ITEM: IntegrationHealthAlertItem = {
  key: "switchbot",
  label: "SwitchBot（スマートロック）",
  href: "/admin/settings/integrations?tab=switchbot",
};

export function selectIntegrationHealthAlertItems(
  health: IntegrationHealth,
  options: { readonly hasSmartLockDevices: boolean },
): IntegrationHealthAlertItem[] {
  const items: IntegrationHealthAlertItem[] = CORE_INTEGRATIONS.filter(
    (integration) => !health[integration.key],
  );
  if (options.hasSmartLockDevices && !health.switchbot) {
    items.push(SWITCHBOT_ITEM);
  }
  return items;
}
