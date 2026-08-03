import "server-only";

import { prisma } from "@/shared/db/prisma";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import type { Prisma } from "@generated/prisma/client";
import { jstDayStartInstant } from "@/shared/lib/date-format";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { isRecord, toPlainObject } from "@/shared/lib/serialize";

export type AuditLogItem = {
  id: string;
  sequence: string;
  previousHash: string;
  entryHash: string;
  hashAlgorithm: string;
  hashKeyId: string;
  chainVersion: number;
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
  search?: string | undefined;
  ipAddress?: string | undefined;
  securityOnly?: boolean | undefined;
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

type AuditLogWhere = Prisma.AuditLogWhereInput;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AUDIT_LOG_EXPORT_LIMIT = 10_000;
const SECURITY_AUDIT_ACTIONS = [
  AuditAction.LOGIN_SUCCESS,
  AuditAction.LOGIN_FAILED,
  AuditAction.LOGOUT,
  AuditAction.PERMISSION_DENIED,
  AuditAction.PASSWORD_CHANGE,
  AuditAction.PASSWORD_RESET_REQUEST,
  AuditAction.PASSWORD_RESET_FAILED,
  AuditAction.ROLE_CHANGE,
  AuditAction.EXPORT,
  AuditAction.INTEGRITY_CHECK,
] satisfies AuditAction[];

const auditLogSelect = {
  id: true,
  sequence: true,
  previousHash: true,
  entryHash: true,
  hashAlgorithm: true,
  hashKeyId: true,
  chainVersion: true,
  userId: true,
  action: true,
  resource: true,
  resourceId: true,
  oldValue: true,
  newValue: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

function parseAuditDateBound(value: string, boundary: "start" | "end"): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return new Date(value);
  }

  const suffix =
    boundary === "start" ? "T00:00:00.000+09:00" : "T23:59:59.999+09:00";
  return new Date(`${value}${suffix}`);
}

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

/**
 * フリーワードが実行ユーザーの名前・メールに一致する User の id を引く。
 *
 * `AuditLog.userId` は `user` への FK を持たない論理参照（証跡テーブルを FK の
 * 参照アクションで書き換えさせないため。schema.prisma の AuditLog.userId 参照）なので、
 * Prisma のリレーションフィルタ `{ user: { is: ... } }` が使えない。同じ絞り込みを
 * 「先に id を引いて `userId in (...)` に落とす」2 段クエリで表現する。
 */
async function findActorIdsMatching(search: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

function buildAuditLogWhere(
  filters: Required<AuditLogFilters>,
  actorIdsMatchingSearch: readonly string[],
): AuditLogWhere {
  const where: AuditLogWhere = {};
  const search = (filters.search ?? "").trim();
  const ipAddress = (filters.ipAddress ?? "").trim();

  if (filters.action !== "ALL" && filters.action !== undefined) {
    where.action = filters.action;
  } else if (filters.securityOnly) {
    where.action = { in: SECURITY_AUDIT_ACTIONS };
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
      where.createdAt.gte = parseAuditDateBound(filters.dateFrom, "start");
    }
    if (filters.dateTo) {
      where.createdAt.lte = parseAuditDateBound(filters.dateTo, "end");
    }
  }

  if (search) {
    where.OR = [
      { resource: { contains: search, mode: "insensitive" } },
      { resourceId: { contains: search, mode: "insensitive" } },
      // 一致するユーザーが 0 件なら OR 項自体を足さない（`in: []` は常に偽なので
      // 足しても同義だが、無駄な述語を SQL に載せない）
      ...(actorIdsMatchingSearch.length > 0
        ? [{ userId: { in: [...actorIdsMatchingSearch] } }]
        : []),
    ];
  }

  if (ipAddress) {
    where.metadata = {
      path: ["ipAddress"],
      string_contains: ipAddress,
    };
  }

  return where;
}

type SelectedAuditLog = Prisma.AuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

type AuditActor = NonNullable<AuditLogItem["user"]>;

/**
 * 行に実行ユーザーの表示情報を貼り直す。
 *
 * FK を外したので `include` で引けない。id を集めて 1 回だけ引き直し、Map で合流する
 * （行数ぶんクエリを撃たない）。**削除済みユーザーの行は `user: null` になる** —
 * これは FK 撤去の設計上の帰結で、`userId` 自体は証跡として残る。
 */
async function attachActors(
  logs: readonly SelectedAuditLog[],
): Promise<AuditLogItem[]> {
  const actorIds = [
    ...new Set(
      logs
        .map((log) => log.userId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const actorById = new Map<string, AuditActor>(
    actors.map((actor) => [actor.id, actor]),
  );

  return logs.map((log) => ({
    ...log,
    sequence: log.sequence.toString(),
    createdAt: log.createdAt.toISOString(),
    metadata: parseAuditLogMetadata(log.metadata),
    user: log.userId === null ? null : (actorById.get(log.userId) ?? null),
  }));
}

export async function getAuditLogs(
  filters: Required<AuditLogFilters>,
): Promise<AuditLogResult> {
  const search = (filters.search ?? "").trim();
  const where = buildAuditLogWhere(
    filters,
    search ? await findActorIdsMatching(search) : [],
  );
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({ page: filters.page, limit: filters.perPage ?? 20 });

  const [logs, total] = await prisma.$transaction(
    async (tx) => {
      const logs = await tx.auditLog.findMany({
        where,
        select: auditLogSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      });
      const total = await tx.auditLog.count({ where });

      return [logs, total] as const;
    },
    { isolationLevel: "RepeatableRead" },
  );

  return toPlainObject({
    logs: await attachActors(logs),
    total,
    page,
    totalPages: calcTotalPages(total, perPage),
  });
}

export async function getAuditLogsForExport(
  filters: Required<AuditLogFilters>,
): Promise<AuditLogItem[]> {
  const search = (filters.search ?? "").trim();
  const where = buildAuditLogWhere(
    filters,
    search ? await findActorIdsMatching(search) : [],
  );
  const logs = await prisma.auditLog.findMany({
    where,
    select: auditLogSelect,
    orderBy: { createdAt: "asc" },
    take: AUDIT_LOG_EXPORT_LIMIT,
  });

  return toPlainObject(await attachActors(logs));
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
  const todayStart = jstDayStartInstant(new Date());

  const securityActions = [
    AuditAction.LOGIN_SUCCESS,
    AuditAction.LOGIN_FAILED,
    AuditAction.LOGOUT,
    AuditAction.PERMISSION_DENIED,
    AuditAction.PASSWORD_CHANGE,
    AuditAction.PASSWORD_RESET_REQUEST,
    AuditAction.PASSWORD_RESET_FAILED,
    AuditAction.ROLE_CHANGE,
    AuditAction.EXPORT,
    AuditAction.INTEGRITY_CHECK,
  ];

  const [total, todayCount, securityEvents, actionCounts] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({
      where: { createdAt: { gte: todayStart } },
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
