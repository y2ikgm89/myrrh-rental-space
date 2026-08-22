/**
 * SpaceRatePlan の CRUD command。
 *
 * `getSpaceRatePlans`（rate-plan-queries.ts）はキャッシュしないため、書込の副作用に
 * キャッシュ無効化は無い（監査 A-02。admin の `updateTag` は別サービスの public
 * コンテナに届かず、金額を最大 1 時間ずらしていた）。次の読み取りが必ず DB を見る。
 *
 * `hourlyPrice` は schema 上 Int のため create/update の戻り値も number。
 */
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { SpaceRatePlan } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
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

/**
 * 指定 id の SpaceRatePlan が存在することを保証する。
 *
 * `update` / `delete` は存在しない id を渡すと Prisma が生の
 * `PrismaClientKnownRequestError`（P2025）を throw し、`isDomainError` の
 * catch を素通りして未処理例外になる（`spaces/commands.ts` の
 * `ensureSpaceExists` / `blocked-dates/commands.ts` の
 * `ensureBlockedDateExists` と同型の pre-check で防ぐ）。
 */
async function ensureSpaceRatePlanExists(id: string): Promise<void> {
  const existing = await prisma.spaceRatePlan.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError("料金プランが見つかりません", "NOT_FOUND");
  }
}

async function ensureActiveSpaceExists(spaceId: string): Promise<void> {
  const space = await prisma.space.findFirst({
    where: { id: spaceId, isActive: true },
    select: { id: true },
  });
  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }
}

/** SpaceRatePlan を新規作成する。 */
export async function createSpaceRatePlan(
  input: CreateSpaceRatePlanInput,
): Promise<SpaceRatePlan> {
  await ensureActiveSpaceExists(input.spaceId);

  return prisma.spaceRatePlan.create({
    data: input,
  });
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
  await ensureSpaceRatePlanExists(id);

  return prisma.spaceRatePlan.update({
    where: { id },
    data: input,
  });
}

/** SpaceRatePlan を削除する。 */
export async function deleteSpaceRatePlan(id: string): Promise<void> {
  await ensureSpaceRatePlanExists(id);

  await prisma.spaceRatePlan.delete({
    where: { id },
    select: { id: true },
  });
}
