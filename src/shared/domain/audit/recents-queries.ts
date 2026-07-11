"use cache";

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { prisma } from "@/shared/db/prisma";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { Resource } from "@/shared/lib/admin-resources";
import type { RecentItem } from "@/shared/lib/command-palette-types";

// `satisfies readonly Resource[]` により Resource union と drift すると compile error。
// 集合追加時は Resource type にも該当 literal が居ることを型で強制する。
const SUPPORTED_RESOURCE_LIST = [
  "space",
  "customer",
  "reservation",
  "post",
  "news",
  "page",
  "event",
  "inquiry",
  "faq",
  "coupon",
  "location",
] as const satisfies readonly Resource[];
const SUPPORTED_RESOURCES: ReadonlySet<string> = new Set<string>(
  SUPPORTED_RESOURCE_LIST,
);

function isSupported(resource: string): resource is Resource {
  return SUPPORTED_RESOURCES.has(resource);
}

function buildHref(resource: Resource, resourceId: string): string {
  switch (resource) {
    case "page":
      return `/admin/pages`;
    case "faq":
      return `/admin/faq/${resourceId}`;
    case "location":
      return `/admin/spaces?tab=locations`;
    default:
      return `/admin/${resource}s/${resourceId}`;
  }
}

export async function getRecentAuditedResources(
  userId: string,
  role: Role,
  limit = 8,
): Promise<RecentItem[]> {
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(getCacheTag.auditLogs.recent(userId));

  const logs = await prisma.auditLog.findMany({
    where: { userId, resourceId: { not: null } },
    select: { resource: true, resourceId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
  });

  const seen = new Set<string>();
  const results: RecentItem[] = [];

  for (const log of logs) {
    if (results.length >= limit) break;
    if (!log.resourceId) continue;

    const resource = log.resource;
    if (!isSupported(resource)) continue;
    if (!hasPermission(role, resource, "read")) continue;

    const id = `${resource}:${log.resourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      resource,
      resourceId: log.resourceId,
      label: `${resource}: ${log.resourceId.slice(0, 8)}`,
      href: buildHref(resource, log.resourceId),
      occurredAt: log.createdAt.toISOString(),
    });
  }

  return results;
}
