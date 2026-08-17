import { describe, expect, test } from "bun:test";
import { selectIntegrationHealthAlertItems } from "@/app/(admin)/admin/(dashboard)/_components/select-integration-health-alert-items";

const healthy = {
  resend: true,
  stripe: true,
  googleCalendar: true,
  turnstile: true,
  switchbot: true,
} as const;

describe("selectIntegrationHealthAlertItems", () => {
  test("スマートロックデバイスが無いときは SwitchBot を出さない", () => {
    const items = selectIntegrationHealthAlertItems(
      { ...healthy, switchbot: false },
      { hasSmartLockDevices: false },
    );

    expect(items.some((item) => item.key === "switchbot")).toBe(false);
  });

  test("デバイスありかつ SwitchBot が unhealthy のとき SwitchBot を出す", () => {
    const items = selectIntegrationHealthAlertItems(
      { ...healthy, switchbot: false },
      { hasSmartLockDevices: true },
    );

    expect(items.some((item) => item.key === "switchbot")).toBe(true);
    expect(items.find((item) => item.key === "switchbot")?.href).toBe(
      "/admin/settings/integrations?tab=switchbot",
    );
  });

  test("デバイスありかつ SwitchBot が healthy のときは SwitchBot を出さない", () => {
    const items = selectIntegrationHealthAlertItems(healthy, {
      hasSmartLockDevices: true,
    });

    expect(items.some((item) => item.key === "switchbot")).toBe(false);
  });
});
