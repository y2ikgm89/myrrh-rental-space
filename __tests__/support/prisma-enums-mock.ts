import { mock } from "bun:test";

/**
 * `@generated/prisma/enums` の mock.module 用ヘルパー。
 *
 * prisma-types gateway が `@generated/prisma/enums` から多数の enum を
 * re-export するため、部分 mock だけだと `export 'X' not found` で
 * import 時に失敗する。generated の実 enum をベースにし、必要なら override する。
 */
export async function installPrismaEnumsMock(
  overrides?: Record<string, unknown>,
): Promise<void> {
  const actualEnums = await import("@generated/prisma/enums");
  mock.module("@generated/prisma/enums", () => ({
    ...actualEnums,
    ...overrides,
  }));
}
