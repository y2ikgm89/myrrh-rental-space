import "server-only";

import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { isGoogleWorkspaceGroupMember } from "@/shared/lib/google-workspace/cloud-identity-groups";
import {
  ADMIN_OR_HIGHER_ROLES,
  DASHBOARD_ROLES,
  isAdminOrHigherRole,
  isDashboardRole,
} from "@/shared/lib/admin-roles";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import { AuditAction, Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { serverEnv } from "@/shared/lib/env/server";
import type { AdminAuthUser } from "./queries";
import type { Prisma } from "@generated/prisma/client";

type AdminRoleGroup = {
  role: (typeof DASHBOARD_ROLES)[number];
  groupEmail: string;
};

type GroupMembershipChecker = (params: {
  groupEmail: string;
  memberEmail: string;
}) => Promise<boolean>;

type SyncUserRow = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  emailVerified: boolean;
  dashboardEnabled: boolean;
};

const ROLE_GROUP_ENV = [
  {
    role: Role.SUPER_ADMIN,
    envName: "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
  },
  {
    role: Role.ADMIN,
    envName: "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
  },
  {
    role: Role.EDITOR,
    envName: "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
  },
  {
    role: Role.VIEWER,
    envName: "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
  },
] as const;

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  emailVerified: true,
  dashboardEnabled: true,
} as const satisfies Prisma.UserSelect;

function readConfiguredRoleGroups(): AdminRoleGroup[] | null {
  const groupValues = ROLE_GROUP_ENV.map((entry) => {
    return {
      role: entry.role,
      groupEmail: serverEnv[entry.envName],
      envName: entry.envName,
    };
  });
  // 絞り込みと件数の判定を 1 パスにまとめる。`some` / `every` を別に取ると、
  // その結果は `groupEmail` の型を絞らないので、最後の map で
  // `groupEmail as string` が要る形になっていた。
  const configured = groupValues.flatMap(({ role, groupEmail }) =>
    typeof groupEmail === "string" ? [{ role, groupEmail }] : [],
  );

  if (configured.length === 0) return null;
  if (configured.length !== groupValues.length) {
    throw new Error("Google Workspace role group sync is partially configured");
  }

  return configured;
}

function defaultNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  return localPart && localPart.trim().length > 0 ? localPart : email;
}

function toAdminAuthUser(user: SyncUserRow): AdminAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

async function writeGoogleRoleSyncAudit(input: {
  action:
    | typeof AuditAction.CREATE
    | typeof AuditAction.UPDATE
    | typeof AuditAction.ROLE_CHANGE;
  email: string;
  resourceId: string;
  oldValue?: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): Promise<void> {
  try {
    await createAuditLogRecord({
      action: input.action,
      resource: "user",
      resourceId: input.resourceId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      metadata: {
        source: "google-workspace-role-sync",
        targetEmail: input.email,
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "syncAdminAuthUserFromGoogleGroups.auditLog",
        action: input.action,
        resourceId: input.resourceId,
        targetEmail: input.email,
      },
    });
  }
}

async function notifyRoleChange(input: {
  email: string;
  oldRole: Role;
  newRole: Role;
}): Promise<void> {
  try {
    await createNotificationCommand({
      type: NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE,
      title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE],
      message: `${input.email} のロールが ${input.oldRole} → ${input.newRole} に変更されました（Google Workspace グループ同期）`,
      resourceType: "user",
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "syncAdminAuthUserFromGoogleGroups.notifyRoleChange",
        targetEmail: input.email,
      },
    });
  }
}

async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: {
      id: { not: userId },
      dashboardEnabled: true,
      role: { in: [...ADMIN_OR_HIGHER_ROLES] },
    },
  });
  return others === 0;
}

async function refuseLastAdminChange(input: {
  email: string;
  userId: string;
  reason: "revoke" | "demote";
  existing: SyncUserRow;
}): Promise<AdminAuthUser | null> {
  logError(
    normalizeError(
      new Error(
        `Refusing Google role sync ${input.reason}: last active ADMIN/SUPER_ADMIN`,
      ),
    ),
    {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "syncAdminAuthUserFromGoogleGroups.lastAdminGuard",
        reason: input.reason,
        targetEmail: input.email,
        userId: input.userId,
      },
    },
  );

  await writeGoogleRoleSyncAudit({
    action: AuditAction.UPDATE,
    email: input.email,
    resourceId: input.userId,
    oldValue: {
      role: input.existing.role,
      dashboardEnabled: input.existing.dashboardEnabled,
    },
    newValue: {
      role: input.existing.role,
      dashboardEnabled: input.existing.dashboardEnabled,
      lastAdminGuard: input.reason,
    },
  });

  return input.existing.dashboardEnabled
    ? toAdminAuthUser(input.existing)
    : null;
}

export function isAdminRoleGroupSyncConfigured(): boolean {
  return readConfiguredRoleGroups() !== null;
}

export async function resolveRoleFromGoogleWorkspaceGroups(
  email: string,
  isGroupMember: GroupMembershipChecker = isGoogleWorkspaceGroupMember,
): Promise<Role | null> {
  const roleGroups = readConfiguredRoleGroups();
  if (!roleGroups) return null;

  const memberships = await Promise.all(
    roleGroups.map(async (entry) => ({
      role: entry.role,
      isMember: await isGroupMember({
        groupEmail: entry.groupEmail,
        memberEmail: email,
      }),
    })),
  );
  const matchedRoles = memberships
    .filter((membership) => membership.isMember)
    .map((membership) => membership.role);

  if (matchedRoles.length !== 1) return null;
  const [role] = matchedRoles;
  if (!role) return null;
  return isDashboardRole(role) ? role : null;
}

async function revokeDashboardAccess(
  email: string,
  existing: SyncUserRow,
): Promise<AdminAuthUser | null> {
  if (!isDashboardRole(existing.role)) {
    return null;
  }
  if (!existing.dashboardEnabled) {
    return null;
  }

  if (
    isAdminOrHigherRole(existing.role) &&
    (await isLastActiveAdmin(existing.id))
  ) {
    return refuseLastAdminChange({
      email,
      userId: existing.id,
      reason: "revoke",
      existing,
    });
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { dashboardEnabled: false },
    select: AUTH_USER_SELECT,
  });

  await writeGoogleRoleSyncAudit({
    action: AuditAction.UPDATE,
    email,
    resourceId: updated.id,
    oldValue: { dashboardEnabled: true, role: existing.role },
    newValue: { dashboardEnabled: false, role: updated.role },
  });

  return null;
}

async function upsertEnabledDashboardUser(
  email: string,
  role: Role,
  existing: SyncUserRow | null,
): Promise<AdminAuthUser> {
  if (existing) {
    const demotingLastAdmin =
      existing.dashboardEnabled &&
      isAdminOrHigherRole(existing.role) &&
      !isAdminOrHigherRole(role) &&
      (await isLastActiveAdmin(existing.id));

    if (demotingLastAdmin) {
      const kept = await refuseLastAdminChange({
        email,
        userId: existing.id,
        reason: "demote",
        existing,
      });
      if (kept) return kept;
      // disabled last-admin edge: re-enable with prior role instead of demoting
      const restored = await prisma.user.update({
        where: { id: existing.id },
        data: {
          dashboardEnabled: true,
          emailVerified: true,
          name: existing.name || defaultNameFromEmail(email),
        },
        select: AUTH_USER_SELECT,
      });
      return toAdminAuthUser(restored);
    }

    if (
      existing.role === role &&
      existing.emailVerified &&
      existing.dashboardEnabled
    ) {
      return toAdminAuthUser(existing);
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role,
        emailVerified: true,
        dashboardEnabled: true,
        name: existing.name || defaultNameFromEmail(email),
      },
      select: AUTH_USER_SELECT,
    });

    const roleChanged = existing.role !== updated.role;

    await writeGoogleRoleSyncAudit({
      action: roleChanged ? AuditAction.ROLE_CHANGE : AuditAction.UPDATE,
      email,
      resourceId: updated.id,
      oldValue: roleChanged
        ? {
            role: existing.role,
            dashboardEnabled: existing.dashboardEnabled,
          }
        : {
            emailVerified: existing.emailVerified,
            dashboardEnabled: existing.dashboardEnabled,
          },
      newValue: {
        role: updated.role,
        emailVerified: updated.emailVerified,
        dashboardEnabled: updated.dashboardEnabled,
      },
    });

    if (roleChanged) {
      await notifyRoleChange({
        email,
        oldRole: existing.role,
        newRole: updated.role,
      });
    }

    return toAdminAuthUser(updated);
  }

  try {
    const created = await prisma.user.create({
      data: {
        email,
        name: defaultNameFromEmail(email),
        role,
        emailVerified: true,
        dashboardEnabled: true,
      },
      select: AUTH_USER_SELECT,
    });

    await writeGoogleRoleSyncAudit({
      action: AuditAction.CREATE,
      email,
      resourceId: created.id,
      newValue: {
        role: created.role,
        emailVerified: created.emailVerified,
        dashboardEnabled: created.dashboardEnabled,
      },
    });

    return toAdminAuthUser(created);
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error, "User.email")) {
      throw error;
    }

    const raced = await prisma.user.findUnique({
      where: { email },
      select: AUTH_USER_SELECT,
    });
    if (!raced) {
      throw error;
    }
    return upsertEnabledDashboardUser(email, role, raced);
  }
}

export async function syncAdminAuthUserFromGoogleGroups(
  email: string,
): Promise<AdminAuthUser | null> {
  let role: Role | null;
  try {
    role = await resolveRoleFromGoogleWorkspaceGroups(email);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "syncAdminAuthUserFromGoogleGroups.resolveRole",
      },
    });
    return null;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: AUTH_USER_SELECT,
  });

  if (!role) {
    if (!existing) return null;
    return revokeDashboardAccess(email, existing);
  }

  return upsertEnabledDashboardUser(email, role, existing);
}
