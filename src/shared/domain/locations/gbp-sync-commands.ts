/**
 * Google Business Profile 同期に関する domain command。
 *
 * - `syncLocationToGbpCommand`: location-sync helper への delegate
 * - `toggleLocationGbpSyncCommand`: `Location.gbpSyncEnabled` のトグル + 無効化時の error クリア
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import { syncLocationToGbp } from "@/shared/lib/google-business-profile";
import type { GbpSyncResult } from "@/shared/lib/google-business-profile";

export type SyncLocationToGbpInput = { readonly locationId: string };

export async function syncLocationToGbpCommand(
  input: SyncLocationToGbpInput,
): Promise<GbpSyncResult> {
  return syncLocationToGbp(input);
}

export type ToggleLocationGbpSyncInput = {
  readonly locationId: string;
  readonly enabled: boolean;
};

export type ToggleLocationGbpSyncResult = {
  readonly id: string;
  readonly gbpSyncEnabled: boolean;
};

export async function toggleLocationGbpSyncCommand(
  input: ToggleLocationGbpSyncInput,
): Promise<ToggleLocationGbpSyncResult> {
  const location = await prisma.location.update({
    where: { id: input.locationId },
    data: {
      gbpSyncEnabled: input.enabled,
      ...(input.enabled === false ? { gbpSyncError: null } : {}),
    },
    select: { id: true, gbpSyncEnabled: true },
  });
  return location;
}
