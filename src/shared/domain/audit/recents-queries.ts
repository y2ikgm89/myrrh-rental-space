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

// 不規則複数形・不可算名詞（naive な `${resource}s` だと壊れる route segment）。
const IRREGULAR_PATH_SEGMENT: Partial<Record<Resource, string>> = {
  news: "news", // 不可算: "s" を付けると /admin/newss になる
  inquiry: "inquiries", // 不規則複数形: /admin/inquirys ではなく /admin/inquiries
};

function pluralPathSegment(resource: Resource): string {
  return IRREGULAR_PATH_SEGMENT[resource] ?? `${resource}s`;
}

/**
 * Round-5 audit Finding #17: page / location は resourceId をそのまま
 * `/admin/${resource}s/${resourceId}` に埋め込んでも実際のルートと一致せず、
 * クリックしても一覧に飛ぶだけの dead link になっていた。
 *
 * - page はルートが slug ベース (`/admin/pages/[slug]`) で AuditLog.resourceId
 *   は id のため、id→slug を解決できた場合のみ具体的なページへリンクする
 *   (削除済み等で解決できなければ一覧へ フォールバック)
 * - location は `/admin/locations/[id]` という id ベースの専用詳細ページが
 *   存在するため直接リンクできる (旧実装は存在しない `/admin/spaces?tab=locations`
 *   のクエリを使っていた)
 * - faq は category 編集・item 編集の両方が resource: "faq" で記録され、
 *   resourceId が category id か item id かを id だけでは判別できない
 *   (誤って item id を category id として使うと dead link になる) ため、
 *   確実に正しいリンクを作れる保証がなく一覧へ集約する
 */
function buildHref(
  resource: Resource,
  resourceId: string,
  pageSlugById: ReadonlyMap<string, string>,
): string {
  switch (resource) {
    case "faq":
      return `/admin/faq`;
    case "location":
      return `/admin/locations/${resourceId}`;
    case "page": {
      const slug = pageSlugById.get(resourceId);
      return slug !== undefined ? `/admin/pages/${slug}` : `/admin/pages`;
    }
    default:
      return `/admin/${pluralPathSegment(resource)}/${resourceId}`;
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
  const picked: {
    id: string;
    resource: Resource;
    resourceId: string;
    label: string;
    occurredAt: string;
  }[] = [];

  for (const log of logs) {
    if (picked.length >= limit) break;
    if (!log.resourceId) continue;

    const resource = log.resource;
    if (!isSupported(resource)) continue;
    if (!hasPermission(role, resource, "read")) continue;

    const id = `${resource}:${log.resourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    picked.push({
      id,
      resource,
      resourceId: log.resourceId,
      label: `${resource}: ${log.resourceId.slice(0, 8)}`,
      occurredAt: log.createdAt.toISOString(),
    });
  }

  const pageIds = picked
    .filter((p) => p.resource === "page")
    .map((p) => p.resourceId);
  const pageSlugById = new Map<string, string>();
  if (pageIds.length > 0) {
    const pages = await prisma.page.findMany({
      where: { id: { in: pageIds } },
      select: { id: true, slug: true },
    });
    for (const p of pages) {
      pageSlugById.set(p.id, p.slug);
    }
  }

  return picked.map((p) => ({
    ...p,
    href: buildHref(p.resource, p.resourceId, pageSlugById),
  }));
}
