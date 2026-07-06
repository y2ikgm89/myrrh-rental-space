import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { encrypt, safeDecrypt } from "@/shared/lib/crypto";
import { getGoogleCalendarServiceAccountConfig } from "@/shared/domain/settings/admin-queries";
import {
  parseGoogleServiceAccountCredentials,
  type GoogleServiceAccountCredentials,
} from "@/shared/lib/validations/google-service-account";

export function parseServiceAccountCredentials(
  json: string,
): GoogleServiceAccountCredentials | null {
  return parseGoogleServiceAccountCredentials(json);
}

/**
 * サービスアカウントのGoogle Calendar APIクライアントを取得
 */
export async function getServiceAccountClient(): Promise<calendar_v3.Calendar | null> {
  const settings = await getGoogleCalendarServiceAccountConfig();

  if (!settings.enabled || !settings.encryptedServiceAccountJson) {
    return null;
  }

  const decryptedJson = safeDecrypt(settings.encryptedServiceAccountJson);
  if (!decryptedJson) {
    logError(new Error("Failed to decrypt service account credentials"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }

  const credentials = parseServiceAccountCredentials(decryptedJson);
  if (!credentials) {
    logError(new Error("Invalid service account credentials JSON"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    return google.calendar({ version: "v3", auth });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }
}

/**
 * サービスアカウントJSONを暗号化
 */
export function encryptServiceAccountJson(json: string): string {
  return encrypt(json, { purpose: "google-calendar-service-account" });
}

/**
 * サービスアカウントJSONからメールアドレスを抽出（マスク表示用）
 */
export function extractServiceAccountEmail(json: string): string | null {
  return parseServiceAccountCredentials(json)?.client_email ?? null;
}
