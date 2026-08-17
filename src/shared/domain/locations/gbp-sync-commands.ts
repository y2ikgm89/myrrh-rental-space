/**
 * Google Business Profile 同期に関する domain command。
 *
 * - `syncLocationToGbpCommand`: Location を GBP API に反映し結果を DB に記録
 * - `toggleLocationGbpSyncCommand`: `Location.gbpSyncEnabled` のトグル + 無効化時の error クリア
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
import { getGbpClient } from "@/shared/lib/google-business-profile/client";
import {
  buildGbpFieldMask,
  buildLocationPayload,
  formatGbpError,
} from "@/shared/lib/google-business-profile/helpers";
import { LocationSchema } from "@/shared/lib/google-business-profile/schemas";
import { syncLocationStub } from "@/shared/lib/google-business-profile/stub";
import type { GbpSyncResult } from "@/shared/lib/google-business-profile/types";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import {
  getGbpAuthState,
  saveGbpAuthState,
} from "@/shared/domain/google-business-profile/settings";
import { ensureLocationExists } from "@/shared/domain/locations/commands";
import { recordConnectionApiResult } from "@/shared/domain/settings/connection-health";
import { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";

const GBP_NOT_CONFIGURED_MESSAGE = "GBP 連携未設定";

export type SyncLocationToGbpInput = { readonly locationId: string };

export async function syncLocationToGbpCommand(
  input: SyncLocationToGbpInput,
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
    const client = getGbpClient(auth, { onTokens: saveGbpAuthState });
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
    await recordConnectionApiResult(IntegrationKey.GOOGLE_BUSINESS_PROFILE, {
      success: true,
    });

    return { locationId: location.id, syncedAt };
  } catch (error) {
    const message = formatGbpError(error);
    await recordConnectionApiResult(IntegrationKey.GOOGLE_BUSINESS_PROFILE, {
      success: false,
      error,
    });
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
  await ensureLocationExists(input.locationId);

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
