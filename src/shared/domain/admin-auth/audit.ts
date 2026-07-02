import "server-only";

import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction, Role } from "@/shared/lib/validations/enums/prisma-types";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

const ADMIN_AUTH_RESOURCE = "adminAuth";
const LOGIN_SUCCESS_DEDUPE_MS = 6 * 60 * 60 * 1000;

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

function requestMetadata(headers: Headers): Record<string, string> {
  const ipAddress = headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  const userAgent = headers.get("user-agent");
  return {
    ...(ipAddress !== null ? { ipAddress } : {}),
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
}
