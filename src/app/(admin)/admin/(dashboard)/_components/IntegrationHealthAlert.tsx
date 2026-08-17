import "server-only";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { getIntegrationHealthSummary } from "@/shared/domain/settings/api-key-queries";
import { hasRegisteredSmartLockDevice } from "@/shared/domain/smart-lock/queries";
import { IntegrationHealthAlertClient } from "./IntegrationHealthAlertClient";
import { selectIntegrationHealthAlertItems } from "./select-integration-health-alert-items";

export { selectIntegrationHealthAlertItems } from "./select-integration-health-alert-items";

/**
 * 主要外部連携の未設定状況を通知する alert（Server Component）。
 * 全て接続済なら null を返し何も表示しない。
 *
 * 配置: 設定トップ（/admin/settings）でのみ表示。dashboard top では非表示。
 * dismiss: Client 側で localStorage に未設定リストの signature を保存し、
 *          同じ未設定状態は再表示しない。新たな未設定が増えたら自動で再表示される。
 */
export async function IntegrationHealthAlert(): Promise<ReactElement | null> {
  await connection();

  const [health, hasSmartLockDevices] = await Promise.all([
    getIntegrationHealthSummary(),
    hasRegisteredSmartLockDevice(),
  ]);
  const disconnected = selectIntegrationHealthAlertItems(health, {
    hasSmartLockDevices,
  });
  if (disconnected.length === 0) return null;

  return <IntegrationHealthAlertClient items={disconnected} />;
}
