import "server-only";

import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  createNotificationCommand,
  hasRecentNotificationOfType,
} from "@/shared/domain/notifications/commands";
import { extractClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { AuditAction, Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

const ADMIN_AUTH_RESOURCE = "adminAuth";
const LOGIN_SUCCESS_DEDUPE_MS = 6 * 60 * 60 * 1000;

// LOGIN_FAILED はこれまで記録されるだけで誰も能動的に見なければ気づけなかった。
// IAP 配下では総当たり攻撃は原理的に成立しない（Google 側が実認証を担う）が、
// Workspace グループ未所属アカウントによる継続アクセス試行や IAP 設定ミスの検知に使う。
const LOGIN_FAILED_SPIKE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILED_SPIKE_THRESHOLD = 5;
// 通知の再送抑制は hasRecentNotificationOfType(type, withinDays) を 6 時間相当で流用
// （faq-stale-check 等と同じ「日数」引数だが分数を渡しても Date 演算としては正しく動く）。
const LOGIN_FAILED_SPIKE_NOTIFICATION_DEDUPE_DAYS = 0.25;

type AdminAuthProvider = "google-iap" | "test-iap";

export type AdminAuthAuditIdentity = {
  email: string;
  provider: AdminAuthProvider;
  subject?: string;
};

type AdminAuthAuditUser = {
  id: string;
  role: Role;
};

// 本番の信頼できる client IP は `cf-connecting-ip` + `x-cloudflare-origin-secret`
// timing-safe 一致時のみ、それ以外は `"unknown"`。`x-forwarded-for` / `x-real-ip`
// 直読みは Cloudflare 前段があるインフラでは client 側追記で spoof 可能なので、
// AuditLog に偽装 IP が焼き付くのを防ぐ。SSoT は rate-limit.ts の extractClientIp。
function requestMetadata(headers: Headers): Record<string, string> {
  const ipAddress = extractClientIpFromHeaders(headers);
  const userAgent = headers.get("user-agent");
  return {
    ipAddress,
    ...(userAgent !== null ? { userAgent } : {}),
  };
}

function identityMetadata(
  identity: AdminAuthAuditIdentity,
): Record<string, string> {
  return {
    provider: identity.provider,
    email: identity.email,
    ...(identity.subject ? { iapSubject: identity.subject } : {}),
  };
}

async function writeAdminAuthAudit(
  input: Parameters<typeof createAuditLogRecord>[0],
): Promise<void> {
  try {
    await createAuditLogRecord(input);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "writeAdminAuthAudit",
        action: input.action,
        resource: input.resource,
      },
    });
  }
}

export async function recordAdminLoginSuccess(input: {
  identity: AdminAuthAuditIdentity;
  user: AdminAuthAuditUser;
  requestHeaders: Headers;
}): Promise<void> {
  const recent = await prisma.auditLog.findFirst({
    where: {
      userId: input.user.id,
      action: AuditAction.LOGIN_SUCCESS,
      resource: ADMIN_AUTH_RESOURCE,
      createdAt: { gte: new Date(Date.now() - LOGIN_SUCCESS_DEDUPE_MS) },
    },
    select: { id: true },
  });

  if (recent) return;

  await writeAdminAuthAudit({
    userId: input.user.id,
    action: AuditAction.LOGIN_SUCCESS,
    resource: ADMIN_AUTH_RESOURCE,
    resourceId: input.user.id,
    metadata: {
      ...requestMetadata(input.requestHeaders),
      ...identityMetadata(input.identity),
      role: input.user.role,
    },
  });
}

export async function recordAdminLoginFailed(input: {
  identity?: AdminAuthAuditIdentity;
  user?: AdminAuthAuditUser;
  reason: "iap_assertion_invalid" | "user_not_authorized" | "role_not_allowed";
  requestHeaders: Headers;
}): Promise<void> {
  await writeAdminAuthAudit(
    omitUndefined({
      userId: input.user?.id,
      action: AuditAction.LOGIN_FAILED,
      resource: ADMIN_AUTH_RESOURCE,
      resourceId: input.user?.id,
      metadata: {
        ...requestMetadata(input.requestHeaders),
        ...(input.identity ? identityMetadata(input.identity) : {}),
        ...(input.user ? { role: input.user.role } : {}),
        reason: input.reason,
      },
    }),
  );

  await notifyLoginFailedSpikeIfNeeded();
}

async function notifyLoginFailedSpikeIfNeeded(): Promise<void> {
  try {
    const recentCount = await prisma.auditLog.count({
      where: {
        action: AuditAction.LOGIN_FAILED,
        resource: ADMIN_AUTH_RESOURCE,
        createdAt: {
          gte: new Date(Date.now() - LOGIN_FAILED_SPIKE_WINDOW_MS),
        },
      },
    });
    if (recentCount < LOGIN_FAILED_SPIKE_THRESHOLD) return;

    const alreadyNotified = await hasRecentNotificationOfType(
      NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE,
      LOGIN_FAILED_SPIKE_NOTIFICATION_DEDUPE_DAYS,
    );
    if (alreadyNotified) return;

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE,
      title:
        NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE],
      message: `直近15分で管理者ログイン失敗が${recentCount.toString()}件発生しています。不正アクセスの可能性を確認してください。`,
      resourceType: "auditLog",
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "notifyLoginFailedSpikeIfNeeded" },
    });
  }
}
