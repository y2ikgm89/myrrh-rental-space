import "server-only";

import { google, type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { prisma } from "@/shared/lib/prisma";
import { getGoogleOAuthCredentials } from "@/shared/lib/google-oauth-credentials";
import type { CalendarConnectionTestResult } from "./types";
import { formatGoogleApiError } from "./helpers";

/**
 * OAuth連携されている管理者のGoogle Calendar APIクライアントを取得
 */
export async function getOAuthClient(
  userId: string,
): Promise<calendar_v3.Calendar | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "google",
    },
    select: {
      id: true,
      accountId: true,
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  });

  if (!account?.accessToken) {
    return null;
  }

  try {
    const credentials = await getGoogleOAuthCredentials();
    if (!credentials) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: account.accessTokenExpiresAt
        ? account.accessTokenExpiresAt.getTime()
        : undefined,
    });

    // トークンリフレッシュのハンドラー
    const accountId = account.id;
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        // refreshTokenも更新（Googleがローテーションした場合に備える）
        await prisma.account.update({
          where: { id: accountId },
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? undefined,
            accessTokenExpiresAt: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : undefined,
          },
        });
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
    const response = await client.calendars.get({
      calendarId: "primary",
    });

    return {
      success: true,
      calendarName: response.data.summary ?? undefined,
    };
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
