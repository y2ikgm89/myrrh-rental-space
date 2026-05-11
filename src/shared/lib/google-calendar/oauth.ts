import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { getGoogleOAuthAccount } from "@/shared/domain/auth/queries";
import { updateGoogleOAuthAccountTokens } from "@/shared/domain/auth/commands";
import { omitUndefined } from "@/shared/lib/serialize";
import type { CalendarConnectionTestResult } from "./types";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";

/**
 * OAuth連携されている管理者のGoogle Calendar APIクライアントを取得
 */
export async function getOAuthClient(
  userId: string,
): Promise<calendar_v3.Calendar | null> {
  const account = await getGoogleOAuthAccount(userId);

  if (!account?.accessToken) {
    return null;
  }

  try {
    if (!serverEnv.GOOGLE_CLIENT_ID || !serverEnv.GOOGLE_CLIENT_SECRET) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      serverEnv.GOOGLE_CLIENT_ID,
      serverEnv.GOOGLE_CLIENT_SECRET,
    );

    oauth2Client.setCredentials(
      omitUndefined({
        access_token: account.accessToken,
        refresh_token: account.refreshToken ?? undefined,
        expiry_date: account.accessTokenExpiresAt
          ? account.accessTokenExpiresAt.getTime()
          : undefined,
      }),
    );

    // トークンリフレッシュのハンドラー
    const accountId = account.id;
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await updateGoogleOAuthAccountTokens(
          omitUndefined({
            accountId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? undefined,
            expiryDate: tokens.expiry_date ?? undefined,
          }),
        );
      }
    });

    return google.calendar({ version: "v3", auth: oauth2Client });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getOAuthClient", userId },
    });
    return null;
  }
}

/**
 * OAuth接続テスト
 */
export async function testOAuthConnection(
  userId: string,
): Promise<CalendarConnectionTestResult> {
  const client = await getOAuthClient(userId);
  if (!client) {
    return { success: false, error: "OAuth is not connected" };
  }

  try {
    const response = await withGoogleApiRetry(() =>
      client.calendars.get({
        calendarId: "primary",
      }),
    );

    return omitUndefined({
      success: true,
      calendarName: response.data.summary ?? undefined,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "testOAuthConnection", userId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}
