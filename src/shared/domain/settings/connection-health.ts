/**
 * 外部連携の接続ヘルス（SSoT）。
 *
 * 資格情報の保存先（各 Settings* 表）とは分離し、全 8 連携が同じ状態機械を使う。
 *
 * - 恒久失敗（認証・設定）→ 即 ERROR
 * - 一時失敗 → consecutiveFailures を加算し、閾値で ERROR
 * - 成功 → CONNECTED へ自動復帰（既に CONNECTED かつ failures=0 なら書かない）
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  extractFirstErrorReason,
  extractStatusCode,
  isRetryableGoogleApiError,
} from "@/shared/lib/google-api/retry";
import { bindConnectionHealthRecorder } from "@/shared/lib/integration-health-port";
import { isRecord } from "@/shared/lib/serialize";
import {
  ConnectionStatus,
  IntegrationKey,
} from "@/shared/lib/validations/enums/prisma-types";

export const CONNECTION_FAILURE_THRESHOLD = 3;

export type ConnectionHealthSnapshot = {
  status: ConnectionStatus | null;
  lastCheckedAt: Date | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
};

const EMPTY_SNAPSHOT: ConnectionHealthSnapshot = {
  status: null,
  lastCheckedAt: null,
  lastErrorMessage: null,
  consecutiveFailures: 0,
};

function toSnapshot(
  row: {
    status: ConnectionStatus | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastErrorMessage: string | null;
    consecutiveFailures: number;
  } | null,
): ConnectionHealthSnapshot {
  if (!row) return EMPTY_SNAPSHOT;
  const lastCheckedAt =
    row.lastSuccessAt && row.lastFailureAt
      ? row.lastSuccessAt >= row.lastFailureAt
        ? row.lastSuccessAt
        : row.lastFailureAt
      : (row.lastSuccessAt ?? row.lastFailureAt);
  return {
    status: row.status,
    lastCheckedAt,
    lastErrorMessage: row.lastErrorMessage,
    consecutiveFailures: row.consecutiveFailures,
  };
}

export async function getConnectionHealth(
  key: IntegrationKey,
): Promise<ConnectionHealthSnapshot> {
  const row = await prisma.integrationHealth.findUnique({
    where: { integration: key },
  });
  return toSnapshot(row);
}

export async function getConnectionHealthMap(): Promise<
  Record<IntegrationKey, ConnectionHealthSnapshot>
> {
  const rows = await prisma.integrationHealth.findMany();
  const map = {
    [IntegrationKey.STRIPE]: EMPTY_SNAPSHOT,
    [IntegrationKey.RESEND]: EMPTY_SNAPSHOT,
    [IntegrationKey.TURNSTILE]: EMPTY_SNAPSHOT,
    [IntegrationKey.GOOGLE_MAPS]: EMPTY_SNAPSHOT,
    [IntegrationKey.GOOGLE_CALENDAR]: EMPTY_SNAPSHOT,
    [IntegrationKey.GOOGLE_BUSINESS_PROFILE]: EMPTY_SNAPSHOT,
    [IntegrationKey.INSTAGRAM]: EMPTY_SNAPSHOT,
    [IntegrationKey.SWITCHBOT]: EMPTY_SNAPSHOT,
  } satisfies Record<IntegrationKey, ConnectionHealthSnapshot>;
  for (const row of rows) {
    map[row.integration] = toSnapshot(row);
  }
  return map;
}

export async function recordConnectionSuccess(
  key: IntegrationKey,
): Promise<void> {
  const existing = await prisma.integrationHealth.findUnique({
    where: { integration: key },
    select: { status: true, consecutiveFailures: true },
  });
  if (
    existing?.status === ConnectionStatus.CONNECTED &&
    existing.consecutiveFailures === 0
  ) {
    return;
  }

  const now = new Date();
  await prisma.integrationHealth.upsert({
    where: { integration: key },
    create: {
      integration: key,
      status: ConnectionStatus.CONNECTED,
      consecutiveFailures: 0,
      lastSuccessAt: now,
      lastErrorMessage: null,
    },
    update: {
      status: ConnectionStatus.CONNECTED,
      consecutiveFailures: 0,
      lastSuccessAt: now,
      lastErrorMessage: null,
    },
  });
}

export async function recordConnectionTestResult(
  key: IntegrationKey,
  result: { success: boolean; error?: string },
): Promise<void> {
  if (result.success) {
    await recordConnectionSuccess(key);
    return;
  }
  await recordConnectionFailure(
    key,
    new Error(result.error ?? "connection test failed"),
    { permanent: true },
  );
}

export async function recordConnectionApiResult(
  key: IntegrationKey,
  result: { success: boolean; error?: unknown },
): Promise<void> {
  if (result.success) {
    await recordConnectionSuccess(key);
    return;
  }
  await recordConnectionFailure(
    key,
    result.error ?? new Error("external API request failed"),
  );
}

/** Stripe 決済 API の成功 / `authentication_error` を接続ヘルスへ載せる。 */
export async function withStripeConnectionHealth<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    await recordConnectionSuccess(IntegrationKey.STRIPE);
    return result;
  } catch (error) {
    await recordConnectionFailure(IntegrationKey.STRIPE, error);
    throw error;
  }
}

export async function recordConnectionFailure(
  key: IntegrationKey,
  error: unknown,
  options?: { permanent?: boolean },
): Promise<void> {
  const permanent =
    options?.permanent ?? isPermanentConnectionFailure(key, error);
  const message = truncateErrorMessage(normalizeError(error).message);
  const now = new Date();

  if (permanent) {
    const existing = await prisma.integrationHealth.findUnique({
      where: { integration: key },
      select: { status: true },
    });
    await prisma.integrationHealth.upsert({
      where: { integration: key },
      create: {
        integration: key,
        status: ConnectionStatus.ERROR,
        consecutiveFailures: CONNECTION_FAILURE_THRESHOLD,
        lastFailureAt: now,
        lastErrorMessage: message,
      },
      update: {
        status: ConnectionStatus.ERROR,
        consecutiveFailures: CONNECTION_FAILURE_THRESHOLD,
        lastFailureAt: now,
        lastErrorMessage: message,
      },
    });
    if (existing?.status !== ConnectionStatus.ERROR) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "recordConnectionFailure",
          integration: key,
          permanent,
          consecutiveFailures: CONNECTION_FAILURE_THRESHOLD,
        },
      });
    }
    return;
  }

  const row = await prisma.integrationHealth.upsert({
    where: { integration: key },
    create: {
      integration: key,
      consecutiveFailures: 1,
      lastFailureAt: now,
      lastErrorMessage: message,
    },
    update: {
      consecutiveFailures: { increment: 1 },
      lastFailureAt: now,
      lastErrorMessage: message,
    },
  });

  if (
    row.consecutiveFailures >= CONNECTION_FAILURE_THRESHOLD &&
    row.status !== ConnectionStatus.ERROR
  ) {
    await prisma.integrationHealth.update({
      where: { integration: key },
      data: { status: ConnectionStatus.ERROR },
    });
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "recordConnectionFailure",
        integration: key,
        permanent,
        consecutiveFailures: row.consecutiveFailures,
      },
    });
  }
}

export async function clearConnectionHealth(
  key: IntegrationKey,
): Promise<void> {
  await prisma.integrationHealth.upsert({
    where: { integration: key },
    create: { integration: key },
    update: {
      status: null,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorMessage: null,
    },
  });
}

export function isPermanentConnectionFailure(
  key: IntegrationKey,
  error: unknown,
): boolean {
  switch (key) {
    case IntegrationKey.GOOGLE_CALENDAR:
    case IntegrationKey.GOOGLE_BUSINESS_PROFILE:
    case IntegrationKey.GOOGLE_MAPS:
      return isPermanentGoogleFailure(error);
    case IntegrationKey.RESEND:
      return isPermanentResendFailure(error);
    case IntegrationKey.STRIPE:
      return isPermanentStripeFailure(error);
    case IntegrationKey.SWITCHBOT:
      return extractStatusCode(error) === 401;
    case IntegrationKey.INSTAGRAM:
      return isPermanentInstagramFailure(error);
    case IntegrationKey.TURNSTILE:
      return isPermanentTurnstileFailure(error);
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function isPermanentGoogleFailure(error: unknown): boolean {
  if (isMapsRequestDenied(error)) return true;
  const status = extractStatusCode(error);
  if (status === 401) return true;
  const reason = extractFirstErrorReason(error);
  if (reason === "invalid_grant" || reason === "invalid_client") return true;
  if (status === 400) {
    const message = errorMessageOf(error);
    return (
      message.includes("invalid_grant") || message.includes("invalid_client")
    );
  }
  if (status === 403) {
    return !isRetryableGoogleApiError(error);
  }
  return false;
}

function isMapsRequestDenied(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error["status"] === "REQUEST_DENIED") return true;
  return errorMessageOf(error).includes("REQUEST_DENIED");
}

function isPermanentResendFailure(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status =
    typeof error["statusCode"] === "number"
      ? error["statusCode"]
      : extractStatusCode(error);
  if (status === 401 || status === 403) return true;
  const name = typeof error["name"] === "string" ? error["name"] : "";
  return (
    name === "invalid_api_key" ||
    errorMessageOf(error).includes("invalid_api_key")
  );
}

function isPermanentStripeFailure(error: unknown): boolean {
  return isRecord(error) && error["type"] === "authentication_error";
}

function isPermanentInstagramFailure(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error["code"] === 190) return true;
  const nested = error["error"];
  return isRecord(nested) && nested["code"] === 190;
}

function isPermanentTurnstileFailure(error: unknown): boolean {
  if (!isRecord(error)) {
    return errorMessageOf(error).includes("invalid-input-secret");
  }
  const codes = error["error-codes"];
  if (Array.isArray(codes) && codes.includes("invalid-input-secret")) {
    return true;
  }
  return errorMessageOf(error).includes("invalid-input-secret");
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error["message"] === "string") {
    return error["message"];
  }
  return "";
}

function truncateErrorMessage(message: string): string {
  return message.length > 500 ? message.slice(0, 500) : message;
}

bindConnectionHealthRecorder(recordConnectionApiResult);
