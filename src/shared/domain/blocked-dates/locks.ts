import "server-only";

import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";

/**
 * 呼び出し側を `Prisma.TransactionClient` に縛らない最小構造型。
 *
 * **引数は必ず Prisma 公式の Input 型で受ける。** `args: object` にすると
 * 列名の typo や消えた列がコンパイルを通り、実行時に
 * `PrismaClientValidationError` になる。実際にこの型が `object` だった間、
 * 下の `spaceFilter` が Space に存在しない `deletedAt` を指しており、
 * GLOBAL / LOCATION スコープの休業日の作成・更新・削除が全て 500 になっていた
 * （Space の soft delete は存在せず `isActive` / `isPublished` しか無い）。
 */
type BlockedDateLockClient = {
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
  readonly space: {
    findMany(args: {
      where: Prisma.SpaceWhereInput;
      select: Prisma.SpaceSelect;
      orderBy: Prisma.SpaceOrderByWithRelationInput;
    }): Promise<{ id: string }[]>;
  };
};

export type BlockedDateLockTarget = Pick<
  BlockedDateFormData,
  "scope" | "spaceId" | "locationId"
>;

/**
 * BlockedDate 書込時に予約 create 経路（728351 space lock）と直列化する。
 * GLOBAL / LOCATION は影響 space を id 昇順で lock し deadlock を防ぐ。
 */
export async function acquireBlockedDateWriteLocks(
  tx: BlockedDateLockClient,
  data: BlockedDateLockTarget,
): Promise<void> {
  if (data.scope === BLOCKED_DATE_SCOPE.SPACE) {
    if (!data.spaceId) {
      return;
    }
    await lockSpaceForTransaction(tx, data.spaceId);
    return;
  }

  // 母集合は絞らない。休業日は「その日は使えない」を宣言するもので、非公開・停止中の
  // Space にも既存の予約が残りうる。lock を取り損ねた Space は予約書込と直列化されず、
  // この lock が防いでいる race がそこだけ開く。
  const spaceFilter: Prisma.SpaceWhereInput =
    data.scope === BLOCKED_DATE_SCOPE.LOCATION && data.locationId
      ? { locationId: data.locationId }
      : {};

  const spaces = await tx.space.findMany({
    where: spaceFilter,
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const space of spaces) {
    await lockSpaceForTransaction(tx, space.id);
  }
}
