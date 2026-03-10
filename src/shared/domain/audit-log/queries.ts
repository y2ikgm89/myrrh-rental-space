import "server-only";

import { prisma } from "@/shared/db/prisma";
import { AuditAction } from "@/shared/db/enums";
import { isRecord, toPlainObject } from "@/shared/lib/serialize";

export type AuditLogItem = {
  id: string;
  userId: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type AuditLogFilters = {
  page?: number | undefined;
  perPage?: number | undefined;
  action?: AuditAction | "ALL" | undefined;
  resource?: string | undefined;
  userId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
};

export type AuditLogResult = {
  logs: AuditLogItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type AuditLogStats = {
  total: number;
  today: number;
  securityEvents: number;
  byAction: Record<string, number>;
};

type AuditLogMetadata = AuditLogItem["metadata"];

type AuditLogWhere = {
  action?: AuditAction;
  resource?: string;
  userId?: string;
  createdAt?: { gte?: Date; lte?: Date };
};

function parseAuditLogMetadata(value: unknown): AuditLogMetadata {
  if (!isRecord(value)) {
    return null;
  }

  const result: AuditLogItem["metadata"] = {};
  if (typeof value["ipAddress"] === "string") {
    result["ipAddress"] = value["ipAddress"];
  }
  if (typeof value["userAgent"] === "string") {
    result["userAgent"] = value["userAgent"];
  }

  for (const [key, itemValue] of Object.entries(value)) {
    if (key !== "ipAddress" && key !== "userAgent") {
      result[key] = itemValue;
    }
  }

  return result;
}

function buildAuditLogWhere(filters: Required<AuditLogFilters>): AuditLogWhere {
  const where: AuditLogWhere = {};

  if (filters.action !== "ALL" && filters.action !== undefined) {
    where.action = filters.action;
  }

  if (filters.resource) {
    where.resource = filters.resource;
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) {
      where.createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.createdAt.lte = new Date(filters.dateTo);
    }
  }

  return where;
}

export async function getAuditLogs(
  filters: Required<AuditLogFilters>,
): Promise<AuditLogResult> {
  const where = buildAuditLogWhere(filters);
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 20;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        userId: true,
        action: true,
        resource: true,
        resourceId: true,
        oldValue: true,
        newValue: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return toPlainObject({
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
      metadata: parseAuditLogMetadata(log.metadata),
    })),
    total,
    page,
    totalPages: Math.ceil(total / perPage),
  });
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const securityActions = [
    AuditAction.LOGIN_SUCCESS,
    AuditAction.LOGIN_FAILED,
    AuditAction.PERMISSION_DENIED,
    AuditAction.PASSWORD_CHANGE,
    AuditAction.ROLE_CHANGE,
  ];

  const [total, todayCount, securityEvents, actionCounts] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({
      where: { createdAt: { gte: today } },
    }),
    prisma.auditLog.count({
      where: { action: { in: securityActions } },
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { action: true },
    }),
  ]);

  const byAction: Record<string, number> = {};
  for (const item of actionCounts) {
    byAction[item.action] = item._count.action;
  }

  return {
    total,
    today: todayCount,
    securityEvents,
    byAction,
  };
}

export async function getAuditLogResources(): Promise<string[]> {
  const resources = await prisma.auditLog.findMany({
    select: { resource: true },
    distinct: ["resource"],
    orderBy: { resource: "asc" },
  });

  return resources.map((resource) => resource.resource);
}
