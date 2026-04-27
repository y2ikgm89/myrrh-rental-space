import "server-only";

import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";

export type BulkEventTarget = {
  id: string;
  slug: string;
};

export type BulkPublishEventsResult = {
  count: number;
  skipped: number;
  isPublished: boolean;
  affectedSlugs: string[];
  affectedTargets: BulkEventTarget[];
};

export type BulkSoftDeleteEventsResult = {
  count: number;
  affectedSlugs: string[];
  affectedTargets: BulkEventTarget[];
};

const PUBLISH_FROM_STATUSES = [EventStatus.DRAFT] as const;
const UNPUBLISH_FROM_STATUSES = [EventStatus.PUBLISHED] as const;

export async function bulkPublishEventsCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishEventsResult> {
  if (ids.length === 0)
    return {
      count: 0,
      skipped: 0,
      isPublished: publish,
      affectedSlugs: [],
      affectedTargets: [],
    };

  const allowedStatuses = publish
    ? PUBLISH_FROM_STATUSES
    : UNPUBLISH_FROM_STATUSES;
  const now = new Date();

  const targets = await prisma.event.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: [...allowedStatuses] },
    },
    select: { id: true, slug: true },
  });

  const targetIds = targets.map((t) => t.id);
  const result =
    targetIds.length === 0
      ? { count: 0 }
      : await prisma.event.updateMany({
          where: { id: { in: targetIds } },
          data: {
            status: publish ? EventStatus.PUBLISHED : EventStatus.DRAFT,
            publishedAt: publish ? now : null,
          },
        });

  return {
    count: result.count,
    skipped: ids.length - result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
    affectedTargets: targets,
  };
}

export async function bulkSoftDeleteEventsCommand(
  ids: string[],
  actor: { id: string },
): Promise<BulkSoftDeleteEventsResult> {
  if (ids.length === 0)
    return { count: 0, affectedSlugs: [], affectedTargets: [] };

  const targets = await prisma.event.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, slug: true },
  });

  const targetIds = targets.map((t) => t.id);
  const result =
    targetIds.length === 0
      ? { count: 0 }
      : await prisma.event.updateMany({
          where: { id: { in: targetIds } },
          data: { deletedAt: new Date(), deletedById: actor.id },
        });

  return {
    count: result.count,
    affectedSlugs: targets.map((t) => t.slug),
    affectedTargets: targets,
  };
}
