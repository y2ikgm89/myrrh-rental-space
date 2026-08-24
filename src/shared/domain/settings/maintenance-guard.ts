import "server-only";

import type { NextResponse } from "next/server";
import { DomainError } from "@/shared/domain/domain-error";
import { getMaintenanceSettings } from "@/shared/domain/settings/queries/site";
import {
  createMutationError,
  type MutationError,
} from "@/shared/lib/mutation-result";
import { jsonError } from "@/shared/lib/route-responses";

export const PUBLIC_MAINTENANCE_BLOCKED_MESSAGE =
  "只今メンテナンス中のため、操作を受け付けておりません。しばらくお待ちください。";

export async function isPublicSiteInMaintenance(): Promise<boolean> {
  try {
    const settings = await getMaintenanceSettings();
    return settings.maintenanceMode;
  } catch {
    return true;
  }
}

export async function assertPublicSiteWritable(): Promise<void> {
  if (await isPublicSiteInMaintenance()) {
    throw new DomainError(PUBLIC_MAINTENANCE_BLOCKED_MESSAGE, "FORBIDDEN");
  }
}

export async function checkPublicSiteWritable(): Promise<
  { readonly ok: true } | { readonly ok: false; readonly error: string }
> {
  if (await isPublicSiteInMaintenance()) {
    return { ok: false, error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE };
  }
  return { ok: true };
}

export async function getPublicMaintenanceBlockMutation(): Promise<MutationError | null> {
  if (await isPublicSiteInMaintenance()) {
    return createMutationError(
      PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
      "MAINTENANCE",
    );
  }
  return null;
}

// jsonError は同期処理のため await 不要（本関数を呼ぶ側は `await` していても
// non-Promise の即時解決として動作するため、既存呼び出し規約を壊さない）。
export function publicMaintenanceJsonResponse(): NextResponse<{
  error: string;
}> {
  return jsonError(PUBLIC_MAINTENANCE_BLOCKED_MESSAGE, 503);
}

export function isCustomerAuthSignOutPath(pathname: string): boolean {
  return /\/sign-out\/?$/u.test(pathname);
}
