/**
 * Google Business Profile location sync ロジック。
 *
 * `syncLocationToGbp` は location の最新データを GBP に反映する graceful な関数で、
 * 失敗時は throw せず `Location.gbpSyncError` に短いメッセージを記録して呼び出し側に返す。
 * `GBP_STUB_MODE=true` 環境ではスタブ実装に委譲し API 接続承認待ち期間でも動作確認できる。
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants/urls";

import { getGbpClient } from "./client";
import {
  buildGbpFieldMask,
  buildLocationPayload,
  formatGbpError,
} from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { getGbpAuthState } from "@/shared/domain/google-business-profile/settings";
import { LocationSchema } from "./schemas";
import { syncLocationStub } from "./stub";
import type { GbpSyncInput, GbpSyncResult } from "./types";

const GBP_NOT_CONFIGURED_MESSAGE = "GBP 連携未設定";
const GBP_NOT_CONFIGURED_ERROR_MESSAGE =
  "Google Business Profile is not configured";

/**
 * Location を Google Business Profile に同期する。
 *
 * フロー:
 * 1. `GBP_STUB_MODE=true` ならスタブ実装で早期 return
 * 2. Location を取得し `gbpSyncEnabled` / `googleBusinessPlaceId` を判定
 * 3. Settings から認証情報を取得し `mybusinessbusinessinformation` v1 client を生成
 * 4. payload + fieldMask を構築して `locations.patch` を retry 付きで呼び出し
 * 5. 成功時は `gbpSyncedAt` を更新、失敗時は `gbpSyncError` に短いメッセージを記録（throw しない）
 */
export async function syncLocationToGbp(
  input: GbpSyncInput,
): Promise<GbpSyncResult> {
  if (serverEnv.GBP_STUB_MODE === "true") {
    return syncLocationStub(input);
  }

  const location = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: {
      id: true,
      name: true,
      postalCode: true,
      city: true,
      streetAddress: true,
      buildingName: true,
      phoneNumber: true,
      businessHours: true,
      latitude: true,
      longitude: true,
      googleBusinessPlaceId: true,
      gbpSyncEnabled: true,
    },
  });

  if (!location) {
    const message = "対象の拠点が見つかりません";
    await prisma.location.updateMany({
      where: { id: input.locationId },
      data: { gbpSyncError: message },
    });
    return { locationId: input.locationId, syncedAt: new Date() };
  }

  // gbpSyncEnabled が false、または GBP リソース ID 未設定の場合は skip
  if (!location.gbpSyncEnabled || !location.googleBusinessPlaceId) {
    await prisma.location.update({
      where: { id: location.id },
      data: { gbpSyncError: null },
    });
    return { locationId: location.id, syncedAt: new Date() };
  }

  const auth = await getGbpAuthState();
  if (!auth) {
    await prisma.location.update({
      where: { id: location.id },
      data: { gbpSyncError: GBP_NOT_CONFIGURED_MESSAGE },
    });
    return { locationId: location.id, syncedAt: new Date() };
  }

  try {
    const client = await getGbpClient(auth);
    const payload = buildLocationPayload({
      name: location.name,
      postalCode: location.postalCode,
      city: location.city,
      streetAddress: location.streetAddress,
      buildingName: location.buildingName,
      phoneNumber: location.phoneNumber,
      businessHours: location.businessHours,
      latitude: location.latitude,
      longitude: location.longitude,
      websiteUri: getAppUrl(),
    });
    const updateMask = buildGbpFieldMask(payload);

    // googleapis SDK 境界。`Schema$Location` は `string | null` を要求するが domain payload は
    // `string | undefined` を返す（pure helper の型契約）。SDK は実行時に undefined / null /
    // 欠落のいずれも同等扱いするため、Zod 4 公式 `z.custom<T>` で型を narrow する。
    const requestBody = LocationSchema.parse(payload);
    const resourceName = location.googleBusinessPlaceId;

    await withGoogleApiRetry(() =>
      client.locations.patch({
        name: resourceName,
        updateMask,
        requestBody,
      }),
    );

    const syncedAt = new Date();
    await prisma.location.update({
      where: { id: location.id },
      data: {
        gbpSyncedAt: syncedAt,
        gbpSyncError: null,
      },
    });

    return { locationId: location.id, syncedAt };
  } catch (error) {
    const message = formatGbpError(error);
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncLocationToGbp",
        locationId: location.id,
        googleBusinessPlaceId: location.googleBusinessPlaceId,
      },
    });
    await prisma.location.update({
      where: { id: location.id },
      data: { gbpSyncError: message },
    });
    return { locationId: location.id, syncedAt: new Date() };
  }
}

export { GBP_NOT_CONFIGURED_ERROR_MESSAGE };
