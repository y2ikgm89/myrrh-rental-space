import "server-only";

import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { isGoogleWorkspaceGroupMember } from "@/shared/lib/google-workspace/cloud-identity-groups";
import { DASHBOARD_ROLES, isDashboardRole } from "@/shared/lib/admin-roles";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { AuditAction, Role } from "@/shared/lib/validations/enums/prisma-types";
import { serverEnv } from "@/shared/lib/env/server";
import type { AdminAuthUser } from "./queries";

type AdminRoleGroup = {
  role: (typeof DASHBOARD_ROLES)[number];
  groupEmail: string;
};

type GroupMembershipChecker = (params: {
  groupEmail: string;
  memberEmail: string;
}) => Promise<boolean>;

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

function readConfiguredRoleGroups(): AdminRoleGroup[] | null {
  const groupValues = ROLE_GROUP_ENV.map((entry) => {
    return {
      role: entry.role,
      groupEmail: serverEnv[entry.envName],
      envName: entry.envName,
    };
  });
  const requiredValues = groupValues.map((entry) => entry.groupEmail);
  const hasAny = requiredValues.some((value) => typeof value === "string");
  const hasAll = requiredValues.every((value) => typeof value === "string");

  if (!hasAny) return null;
  if (!hasAll) {
    throw new Error("Google Workspace role group sync is partially configured");
  }

  return groupValues.map(({ role, groupEmail }) => ({
    role,
    groupEmail: groupEmail as string,
  }));
}

function defaultNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  return localPart && localPart.trim().length > 0 ? localPart : email;
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

export async function syncAdminAuthUserFromGoogleGroups(
  email: string,
): Promise<AdminAuthUser | null> {
  let role: Role | null = null;
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

  if (!role) return null;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      emailVerified: true,
    },
  });

  if (existing) {
    if (existing.role === role && existing.emailVerified) return existing;

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role,
        emailVerified: true,
        name: existing.name || defaultNameFromEmail(email),
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });

    await writeGoogleRoleSyncAudit({
      action:
        existing.role === updated.role
          ? AuditAction.UPDATE
          : AuditAction.ROLE_CHANGE,
      email,
      resourceId: updated.id,
      oldValue:
        existing.role === updated.role
          ? { emailVerified: existing.emailVerified }
          : { role: existing.role },
      newValue: {
        role: updated.role,
        emailVerified: updated.emailVerified,
      },
    });

    return updated;
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: defaultNameFromEmail(email),
      role,
      emailVerified: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      emailVerified: true,
    },
  });

  await writeGoogleRoleSyncAudit({
    action: AuditAction.CREATE,
    email,
    resourceId: created.id,
    newValue: {
      role: created.role,
      emailVerified: created.emailVerified,
    },
  });

  return created;
}
