import "server-only";

import { DomainError } from "@/shared/domain/domain-error";

/** Business Settings 楽観的 concurrency 競合時の共通メッセージ */
export const SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE =
  "他のユーザーにより更新されています。ページを再読み込みしてください";

export function toExpectedUpdatedAt(value: string | Date): Date {
  const expected = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(expected.getTime())) {
    throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
  }
  return expected;
}

export async function casUpdateOrCreateSingleton<
  TUpdate extends Record<string, unknown>,
  TCreate extends Record<string, unknown>,
>({
  updateMany,
  findUnique,
  create,
  expectedUpdatedAt,
  updateData,
  createData,
}: {
  updateMany: (args: {
    where: { id: "singleton"; updatedAt: Date };
    data: TUpdate;
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: { id: "singleton" };
    select: { id: true };
  }) => Promise<{ id: string } | null>;
  create: (args: { data: TCreate }) => Promise<unknown>;
  expectedUpdatedAt: Date;
  updateData: TUpdate;
  createData: TCreate;
}): Promise<void> {
  const result = await updateMany({
    where: { id: "singleton", updatedAt: expectedUpdatedAt },
    data: updateData,
  });
  if (result.count > 0) {
    return;
  }

  const existing = await findUnique({
    where: { id: "singleton" },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
  }

  await create({ data: createData });
}
