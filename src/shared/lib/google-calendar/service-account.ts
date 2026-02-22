import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { safeDecrypt, encryptApiKey } from "@/shared/lib/crypto";
import { prisma } from "@/shared/lib/prisma";

/**
 * サービスアカウントのGoogle Calendar APIクライアントを取得
 */
export async function getServiceAccountClient(): Promise<calendar_v3.Calendar | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarEnabled: true,
      googleCalendarServiceAccountJson: true,
    },
  });

  if (
    !settings?.googleCalendarEnabled ||
    !settings.googleCalendarServiceAccountJson
  ) {
    return null;
  }

  const decryptedJson = safeDecrypt(settings.googleCalendarServiceAccountJson);
  if (!decryptedJson) {
    logError(new Error("Failed to decrypt service account credentials"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }

  try {
    const credentials = JSON.parse(decryptedJson);
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
  return encryptApiKey(json);
}

/**
 * サービスアカウントJSONからメールアドレスを抽出（マスク表示用）
 */
export function extractServiceAccountEmail(json: string): string | null {
  try {
    const parsed = JSON.parse(json);
    return parsed.client_email ?? null;
  } catch {
    return null;
  }
}
