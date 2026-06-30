/**
 * GBP_STUB_MODE=true 用の Google Business Profile sync スタブ実装。
 * 実 API 呼び出しを行わず、入力された locationId をそのまま結果として返す。
 */

import "server-only";

import { logger } from "@/shared/lib/errors/logger-core";

import type { GbpSyncInput, GbpSyncResult } from "./types";

export async function syncLocationStub(
  input: GbpSyncInput,
): Promise<GbpSyncResult> {
  logger.info("GBP sync stubbed", {
    locationId: input.locationId,
    reason: "GBP_STUB_MODE=true",
  });
  return { locationId: input.locationId, syncedAt: new Date() };
}
