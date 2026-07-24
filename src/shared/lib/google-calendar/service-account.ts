import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { encrypt, safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { getGoogleCalendarServiceAccountConfig } from "@/shared/domain/settings/admin-queries";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

/**
 * サービスアカウントのGoogle Calendar APIクライアントを取得
 *
 * `options.ignoreEnabledToggle` (GCAL-OUTBOUND-05): true のとき
 * `googleCalendarEnabled` トグルの ON/OFF を無視し、サービスアカウント JSON が
 * 設定されていればクライアントを返す。delete 系の呼出し (`deleteCalendarEvent`
 * / `patchCalendarEvent` を `ignoreEnabledToggle: true` で呼ぶ経路) 専用で、
 * トグル OFF でも既存 GCal event の削除・打ち切りだけは行えるようにするための
 * gate 緩和。省略時 (false 相当) は既存どおりトグル ON 必須。
 */
export async function getServiceAccountClient(options?: {
  ignoreEnabledToggle?: boolean;
}): Promise<calendar_v3.Calendar | null> {
  const settings = await getGoogleCalendarServiceAccountConfig();

  if (!settings.encryptedServiceAccountJson) {
    return null;
  }
  if (!options?.ignoreEnabledToggle && !settings.enabled) {
    return null;
  }

  const decryptedJson = safeDecryptToString(
    settings.encryptedServiceAccountJson,
    {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
    },
  );
  if (!decryptedJson) {
    logError(new Error("Failed to decrypt service account credentials"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }

  const credentials = parseGoogleServiceAccountCredentials(decryptedJson);
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
  return encrypt(json, {
    purpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
  });
}
