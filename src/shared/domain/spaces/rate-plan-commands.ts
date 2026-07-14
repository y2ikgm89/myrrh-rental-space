/**
 * SpaceRatePlan の CRUD command。
 *
 * `getSpaceRatePlans`（rate-plan-queries.ts、Task 5）が貼る id-keyed cache tag
 * `CACHE_TAGS.SPACE_RATE_PLANS(spaceId)` を、書込の副作用として
 * `invalidateSpaceRatePlansCache` 経由で無効化する。呼び出し元は Server Action
 * 経由を想定（`updateTag` は Server Action 以外のコンテキストで throw する。
 * 詳細は space-rate-plan-cache.ts のコメント参照）。
 *
 * `hourlyPrice` は `createAppPrismaClient` の result 拡張（Decimal → number）が
 * `create` / `update` の戻り値にも適用されるため、呼び出し側は素の number として
 * 扱える（`Prisma.Decimal` ではない）。
 */
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { SpaceRatePlan } from "@/shared/db/prisma";
import { invalidateSpaceRatePlansCache } from "@/shared/lib/cache/space-rate-plan-cache";
import type {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";

export type CreateSpaceRatePlanInput = {
  spaceId: string;
  name: string;
  hourlyPrice: number;
  daysOfWeek: DayOfWeek[];
  holidayMode: HolidayMode;
  startTime: string | null;
  endTime: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type UpdateSpaceRatePlanInput = Partial<
  Omit<CreateSpaceRatePlanInput, "spaceId">
>;

/** SpaceRatePlan を新規作成し、対象 Space の rate plan キャッシュを無効化する。 */
export async function createSpaceRatePlan(
  input: CreateSpaceRatePlanInput,
): Promise<SpaceRatePlan> {
  const plan = await prisma.spaceRatePlan.create({
    data: input,
  });
  invalidateSpaceRatePlansCache(input.spaceId);
  return plan;
}

/**
 * SpaceRatePlan を部分更新する。
 *
 * `updatedAt` は `@updatedAt` により自動 bump される（last-updated-wins 優先度判定の
 * 基準、rate-plan-resolver.ts が使用）。
 */
export async function updateSpaceRatePlan(
  id: string,
  input: UpdateSpaceRatePlanInput,
): Promise<SpaceRatePlan> {
  const plan = await prisma.spaceRatePlan.update({
    where: { id },
    data: input,
  });
  invalidateSpaceRatePlansCache(plan.spaceId);
  return plan;
}

/** SpaceRatePlan を削除し、対象 Space の rate plan キャッシュを無効化する。 */
export async function deleteSpaceRatePlan(id: string): Promise<void> {
  const plan = await prisma.spaceRatePlan.delete({
    where: { id },
    select: { spaceId: true },
  });
  invalidateSpaceRatePlansCache(plan.spaceId);
}
