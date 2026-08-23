/**
 * `@generated/prisma/enums` の `mock.module` は **実モジュールを spread する**。
 *
 * ## なぜ（監査 A-50）
 *
 * `mock.module` は完全置換なので、手書きの定数で差し替えると生成 enum との差分が
 * 静かに `undefined` になる。`status === PaymentStatus.PARTIALLY_REFUNDED` は
 * 「`status === undefined`」＝常に false として評価され、その分岐が一度も通らないまま
 * 全テストが緑になり、本番だけ別の枝を通る。
 *
 * TypeScript も落ちない — 手書き側は `as const` の素のオブジェクトリテラルで、
 * 生成モジュールの型と突合されないため。
 *
 * 実際 pricing テスト 3 本の `ALL_ENUMS` は実 schema からドリフトしていた:
 * `PaymentStatus.PARTIALLY_REFUNDED` 欠落 / `AnalyticsType.ga4` の小文字キー /
 * `AuditAction` の 7 値欠落。
 *
 * ## 何を見るか
 *
 * `__tests__/**` で `mock.module("@generated/prisma/enums", ...)` を書くファイルは、
 * 同じファイルで実モジュールを取り込んでいること（`installPrismaEnumsMock` を使うか、
 * `await import("@generated/prisma/enums")` の結果を渡すか）。
 *
 * **override 自体は禁じない。** `installPrismaEnumsMock({ EventStatus })` のように
 * 実を土台に一部だけ差し替えるのは正しい形。
 *
 * ## 直し方
 *
 * `__tests__/support/prisma-enums-mock.ts` の `installPrismaEnumsMock()` を使う。
 * prisma-types gateway 側も同内容で mock されるので、domain コードの import 経路も揃う。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const TESTS_ROOT = join(ROOT, "__tests__");
const HELPER_REL = "__tests__/support/prisma-enums-mock.ts";

const MOCK_CALL = 'mock.module("@generated/prisma/enums"';

/** 実 enum を土台にしているか（helper 経由 / 実モジュールの取り込み）。 */
export function spreadsRealEnums(source: string): boolean {
  if (source.includes("installPrismaEnumsMock")) return true;
  return source.includes('await import("@generated/prisma/enums")');
}

function testFiles(): string[] {
  return collectSourceFiles(TESTS_ROOT)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("@generated/prisma/enums の mock は実を spread する", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    const files = testFiles();
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((file) => file.endsWith(HELPER_REL))).toBe(true);
  });

  test("落ちるべき書き方: 手書き定数での全体置換", () => {
    expect(
      spreadsRealEnums(
        'const ALL_ENUMS = { Role: { ADMIN: "ADMIN" } } as const;\n' +
          'mock.module("@generated/prisma/enums", () => ALL_ENUMS);',
      ),
    ).toBe(false);
  });

  test("落ちてはいけない書き方: helper と実モジュールの spread", () => {
    expect(spreadsRealEnums("await installPrismaEnumsMock();")).toBe(true);
    expect(
      spreadsRealEnums("await installPrismaEnumsMock({ EventStatus });"),
    ).toBe(true);
    expect(
      spreadsRealEnums(
        'const actualEnums = await import("@generated/prisma/enums");\n' +
          'mock.module("@generated/prisma/enums", () => actualEnums);',
      ),
    ).toBe(true);
  });

  test("実ファイルに手書き全体置換が残っていない", () => {
    const offenders = testFiles().filter((file) => {
      if (file.endsWith(HELPER_REL)) return false;
      const source = readFileSync(file, "utf8");
      if (!source.includes(MOCK_CALL)) return false;
      return !spreadsRealEnums(source);
    });

    expect(offenders).toEqual([]);
  });
});
