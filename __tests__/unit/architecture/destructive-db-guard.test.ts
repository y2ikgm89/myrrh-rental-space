import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  evaluateDestructiveDbTarget,
  resolvePrismaCliDatasourceUrl,
} from "../../../scripts/assert-destructive-db-target";

/**
 * 破壊的な Prisma CLI 操作が、**CLI が実際に使う datasource** を検証してから
 * 走ることを強制する gate。
 *
 * ## 何が壊れていたか
 *
 * `prisma/seed-safety.ts` は seed.ts が起動してから評価される。`bun run db:reset` は
 * `prisma migrate reset --force` を**先に**走らせるので、DB が落ちた後にしか
 * seed のガードは動かない。`--reset` 廃止時の案内文が、守られていない経路を
 * 推奨していた。
 *
 * さらに Prisma CLI の datasource は `prisma.config.ts` が **`DIRECT_URL` 優先**で
 * 解決する。`DATABASE_URL` だけを見るガードは、`.env.local` に本番の `DIRECT_URL` が
 * 残っている状況で素通りする。
 */

const root = process.cwd();

describe("破壊的 DB 操作のガード", () => {
  test("db:reset / db:push はガードを前段に置いている", () => {
    const pkg: unknown = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    if (
      typeof pkg !== "object" ||
      pkg === null ||
      !("scripts" in pkg) ||
      typeof pkg.scripts !== "object" ||
      pkg.scripts === null
    ) {
      throw new Error("package.json の scripts が読めません");
    }
    const scripts: Record<string, unknown> = { ...pkg.scripts };

    for (const name of ["db:reset", "db:push"]) {
      const script = scripts[name];
      expect(typeof script).toBe("string");
      const value = String(script);

      // ガードが**先頭**にあること。後ろに置いても DB は既に落ちている。
      expect(
        value.startsWith("bun scripts/assert-destructive-db-target.ts &&"),
      ).toBe(true);
    }
  });

  test("ガードは Prisma CLI と同じ順序で datasource を解決する", () => {
    // `prisma.config.ts` の実装と突き合わせる（片方だけ変わると素通りする）。
    const config = readFileSync(join(root, "prisma.config.ts"), "utf8");
    expect(config).toContain('process.env["DIRECT_URL"]');

    expect(
      resolvePrismaCliDatasourceUrl({
        DIRECT_URL: "postgresql://u@prod.neon.tech/db",
        DATABASE_URL: "postgresql://u@localhost:5432/dev",
      }),
    ).toEqual({
      url: "postgresql://u@prod.neon.tech/db",
      source: "DIRECT_URL",
    });

    expect(
      resolvePrismaCliDatasourceUrl({
        DATABASE_URL: "postgresql://u@localhost:5432/dev",
      }).source,
    ).toBe("DATABASE_URL");
  });

  test("DATABASE_URL がローカルでも DIRECT_URL が本番なら止める", () => {
    // これが今回の穴そのもの。
    const result = evaluateDestructiveDbTarget({
      DIRECT_URL:
        "postgresql://user:pw@ep-abc-123.us-east-2.aws.neon.tech/main",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/myrrh_dev",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("DIRECT_URL");
  });

  test("ローカルだけのときは通す", () => {
    const result = evaluateDestructiveDbTarget({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/myrrh_dev",
    });

    expect(result.ok).toBe(true);
  });

  test("datasource 未設定なら止める", () => {
    expect(evaluateDestructiveDbTarget({}).ok).toBe(false);
  });

  test("エラーに接続文字列そのものを出さない", () => {
    const result = evaluateDestructiveDbTarget({
      DIRECT_URL: "postgresql://admin:s3cret@ep-abc.neon.tech/main",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // 秘密値（パスワード）を出力・コピーしない絶対規約。
    expect(result.error).not.toContain("s3cret");
    expect(result.error).not.toContain("postgresql://");
  });
});
