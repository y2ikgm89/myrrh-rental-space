import "server-only";

import { prisma } from "@/shared/db/prisma";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";
import { ACTIVE_EVENT_STATUSES } from "@/shared/domain/spaces/overlap";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

export interface AffectedSpace {
  id: string;
  slug: string;
}

export type BulkPublishResult = {
  count: number;
  isPublished: boolean;
  affected: ReadonlyArray<AffectedSpace>;
};

export type BulkDeleteResult = {
  count: number;
  skipped: number;
  skippedIds: ReadonlyArray<string>;
  affected: ReadonlyArray<AffectedSpace>;
};

/**
 * 複数スペースの公開状態を一括切替する。
 *
 * - `publish: true` で `isPublished` を true に設定（`publishedAt` は初回公開時のみ設定）
 * - `publish: false` で `isPublished` を false + `publishedAt` を null にリセット
 * - 戻り値の `affected` は cache invalidation 用（id+slug を1つのレコードで返却）
 */
export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishResult> {
  if (ids.length === 0) {
    return { count: 0, isPublished: publish, affected: [] };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, isPublished: publish, affected: [] };
  }

  const targetIds = targets.map((t) => t.id);

  if (publish) {
    const now = new Date();
    const firstPublish = await prisma.space.updateMany({
      where: {
        id: { in: targetIds },
        isActive: true,
        publishedAt: null,
      },
      data: { isPublished: true, publishedAt: now },
    });
    const republish = await prisma.space.updateMany({
      where: {
        id: { in: targetIds },
        isActive: true,
        publishedAt: { not: null },
      },
      data: { isPublished: true },
    });
    return {
      count: firstPublish.count + republish.count,
      isPublished: publish,
      affected: targets.map((t) => ({ id: t.id, slug: t.slug })),
    };
  }

  const result = await prisma.space.updateMany({
    where: { id: { in: targetIds }, isActive: true },
    data: {
      isPublished: false,
      publishedAt: null,
    },
  });
  return {
    count: result.count,
    isPublished: publish,
    affected: targets.map((t) => ({ id: t.id, slug: t.slug })),
  };
}

/**
 * 複数スペースを一括削除（論理削除）する。
 *
 * 有効な予約または占有中イベント（DRAFT / PUBLISHED）があるスペースはスキップする。
 * 削除対象は `isActive=false` + `isPublished=false` + `publishedAt=null` に統一する。
 * 占有チェックと soft-delete は advisory lock 付き transaction 内で行い、
 * 単体削除と同じ TOCTOU 窓を閉じる。
 * 戻り値の `affected` は cache invalidation 用（実際に削除した id+slug）として返す。
 */
export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) {
    return { count: 0, skipped: 0, skippedIds: [], affected: [] };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, skipped: 0, skippedIds: [], affected: [] };
  }

  // デッドロック回避のため spaceId 昇順で lock を取る
  const lockOrder = [...targets].sort((a, b) => a.id.localeCompare(b.id));

  return prisma.$transaction(async (tx) => {
    for (const target of lockOrder) {
      await lockSpaceForTransaction(tx, target.id);
    }

    const spaceIds = targets.map((t) => t.id);
    // interactive tx は単一コネクション。Promise.all での並行発行は禁止。
    const reservationSpaces = await tx.reservation.findMany({
      where: {
        spaceId: { in: spaceIds },
        deletedAt: null,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      select: { spaceId: true },
      distinct: ["spaceId"],
    });
    const eventSpaces = await tx.event.findMany({
      where: {
        spaceId: { in: spaceIds },
        deletedAt: null,
        status: { in: [...ACTIVE_EVENT_STATUSES] },
      },
      select: { spaceId: true },
      distinct: ["spaceId"],
    });

    const blockedIds = new Set<string>();
    for (const row of reservationSpaces) {
      blockedIds.add(row.spaceId);
    }
    for (const row of eventSpaces) {
      if (row.spaceId !== null) {
        blockedIds.add(row.spaceId);
      }
    }

    const deletable = targets.filter((t) => !blockedIds.has(t.id));
    const skippedIds = targets
      .filter((t) => blockedIds.has(t.id))
      .map((t) => t.id);

    if (deletable.length === 0) {
      return {
        count: 0,
        skipped: skippedIds.length,
        skippedIds,
        affected: [],
      };
    }

    const result = await tx.space.updateMany({
      where: {
        id: { in: deletable.map((t) => t.id) },
        isActive: true,
      },
      data: {
        isActive: false,
        isPublished: false,
        publishedAt: null,
      },
    });

    return {
      count: result.count,
      skipped: skippedIds.length,
      skippedIds,
      affected: deletable,
    };
  });
}
