import { mock } from "bun:test";

/**
 * `@generated/prisma/enums` / prisma-types gateway の mock.module 用ヘルパー。
 *
 * prisma-types gateway が `@generated/prisma/enums` から多数の enum を
 * re-export するため、部分 mock だけだと `export 'X' not found` で
 * import 時に失敗する。generated の実 enum をベースにし、必要なら override する。
 * domain コードが prisma-types 経由で import するため、gateway 側も同内容で mock する。
 */
export async function installPrismaEnumsMock(
  overrides?: Record<string, unknown>,
): Promise<void> {
  const actualEnums = await import("@generated/prisma/enums");
  const mergedEnums = { ...actualEnums, ...overrides };
  mock.module("@generated/prisma/enums", () => mergedEnums);

  const actualPrismaTypes =
    await import("@/shared/lib/validations/enums/prisma-types");
  mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
    ...actualPrismaTypes,
    ...mergedEnums,
  }));
}
