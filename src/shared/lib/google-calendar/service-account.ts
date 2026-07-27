import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

/**
 * 復号済みサービスアカウント JSON から Calendar API client を生成する（純粋 API 層）。
 * Settings I/O は呼び出し側（domain）が担当する。
 */
export function createCalendarClientFromServiceAccountJson(
  decryptedJson: string,
  contextOperation: string = "createCalendarClientFromServiceAccountJson",
): calendar_v3.Calendar | null {
  const credentials = parseGoogleServiceAccountCredentials(decryptedJson);
  if (!credentials) {
    logError(new Error("Invalid service account credentials JSON"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: contextOperation },
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
      context: { operation: contextOperation },
    });
    return null;
  }
}

/**
 * サービスアカウントJSONを暗号化
 */
export function encryptServiceAccountJson(json: string): string {
  return encrypt(json, {
    purpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
  });
}
