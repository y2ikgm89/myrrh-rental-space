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
 *
 * ## なぜ `db:migrate` も対象なのか
 *
 * 当初この gate は `db:reset` / `db:push` の 2 つだけを見ていた。`migrate dev` は
 * 「作る」側なので破壊的ではない、という直感に合うが、**Prisma 公式の記述はそう
 * 言っていない**:
 *
 * > `prisma migrate dev` is intended for development with a **disposable database**.
 * > If it detects a schema drift or migration history conflict, **you will be
 * > prompted to reset your database**.
 *
 * > Prisma Migrate may prompt a database reset, **which drops and recreates the
 * > database, leading to data loss**. This occurs explicitly with
 * > `prisma migrate reset` or when **`prisma migrate dev` detects database drift**.
 *
 * つまり `migrate dev` は `migrate reset` と同じ破壊クラスにいる。しかも drift を
 * 直すために最初に叩かれるコマンドがこれで、接続先は `DIRECT_URL` 優先。
 * 3 つの入口のうち**一番危ないものだけが素通り**していた。
 *
 * ガードが止めるのは本番に見える接続先だけ（Cloud SQL / Neon / 非 localhost /
 * prod marker）なので、ローカル開発の `migrate dev` は従来どおり通る。
 */

const root = process.cwd();

/**
 * `db:reset` の seed step が `APP_SURFACE` を外す経路を通るか。
 *
 * `bun run db:seed` の直接呼び出しは、それだけで拒否される形なので落とす。
 */
function seedStepClearsAppSurface(script: string): boolean {
  if (script.includes("bun run db:seed")) return false;
  return script.includes("bun scripts/seed-local-db.ts");
}

describe("破壊的 DB 操作のガード", () => {
  test("db:reset / db:push / db:migrate はガードを前段に置いている", () => {
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

    for (const name of ["db:reset", "db:push", "db:migrate"]) {
      const script = scripts[name];
      expect(typeof script).toBe("string");
      const value = String(script);

      // ガードが**先頭**にあること。後ろに置いても DB は既に落ちている。
      expect(
        value.startsWith("bun scripts/assert-destructive-db-target.ts &&"),
      ).toBe(true);
    }
  });

  /**
   * `db:reset` の seed step は `APP_SURFACE` を外して呼ぶ（監査 A-19）。
   *
   * `.env.local` に `APP_SURFACE` を入れるのは README / CONTRIBUTING /
   * `.env.example` の指示どおりの状態で、Bun runtime が `.env.local` を自動で
   * 読むためその値は子プロセスまで届く。seed の安全ガードはそれを
   * 「デプロイされたプロセス」の印と見て `--dev` を拒否する。
   *
   * 直接 `bun run db:seed` を繋いでいた頃は、**`migrate reset --force` が DB を
   * 消し終えた後で** seed が exit 1 し、手元には空の DB だけが残った。
   * 文書 3 箇所（CLAUDE.md / AGENTS.md / `.claude/rules/prisma-db.md`）が
   * それを正規手順として勧めていた。
   */
  test("db:reset の seed step は APP_SURFACE を外す script を通る", () => {
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
    const dbReset = String(scripts["db:reset"]);

    // `bun run db:seed` を直接繋ぐと `.env.local` の APP_SURFACE が届いて必ず落ちる。
    expect(seedStepClearsAppSurface(dbReset)).toBe(true);

    // 実体側。script 名だけ揃えて中身が外していなければ意味が無い。
    const seedScript = readFileSync(
      join(root, "scripts", "seed-local-db.ts"),
      "utf8",
    );
    expect(seedScript).toContain('APP_SURFACE: ""');
    expect(seedScript).toContain('"bun", "run", "db:seed"');
  });

  test("seed step の判定が差分を検出する（見本）", () => {
    // 落ちるべき形: 修正前の db:reset。
    expect(
      seedStepClearsAppSurface(
        "bun scripts/assert-destructive-db-target.ts && bunx --bun prisma migrate reset --force && bun run db:seed",
      ),
    ).toBe(false);

    // 落ちるべき形: seed を呼ばない（reset したまま空の DB を残す）。
    expect(
      seedStepClearsAppSurface(
        "bun scripts/assert-destructive-db-target.ts && bunx --bun prisma migrate reset --force",
      ),
    ).toBe(false);

    // 落ちてはいけない形: 外す script を通す。
    expect(
      seedStepClearsAppSurface(
        "bun scripts/assert-destructive-db-target.ts && bunx --bun prisma migrate reset --force && bun scripts/seed-local-db.ts",
      ),
    ).toBe(true);
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
