/**
 * `scripts/migration-preconditions.ts` の**静的な前提**だけを固定する gate。
 *
 * ## この道具は何をするか
 *
 * 未適用 migration を 1 つのトランザクションで実際に流し、最後に必ず巻き戻す。
 * 「落ちるかどうか」の判定は PostgreSQL の実挙動そのもので、ここには無い。
 *
 * 前身は migration SQL を分類してプローブ SQL を組み立てる実装だった。
 * 多角レビューを 2 巡したところ**毎回 10 件規模で取りこぼしが出た**（合計 21 件。
 * 素通り 9 件・通る migration を止める誤検知 12 件）。原因は全部同じで、
 * PostgreSQL の意味論を手で書き写していたこと。`NOT VALID` / `USING` 句 /
 * `ATTACH PARTITION` / `CREATE TABLE AS SELECT` / `varchar` の末尾空白 /
 * 合成した既定値の型 …… どれも「知らなかった」で素通りする。極めつけは
 * 式 index 用に書いたプローブが最適化で**式を一度も評価していなかった**ことで、
 * 道具が「確認した」と言いながら何も見ていなかった。写経はやめた。
 *
 * ## だからここで見るのは 4 つだけ
 *
 * 1. 文の切り出しが壊れていない（`$$ … $$` / `E'…'`）
 * 2. **巻き戻せない文を実行しない**（トランザクション制御 / `CONCURRENTLY`）
 * 3. 接続先の解決が `prisma.config.ts` と同じ（migrate と別の DB を見ない）
 * 4. **DB の履歴が repo と同じ系譜を指している**。Prisma はここを一切見ない
 *    （公式が「ローカルに無い applied migration では警告しない・drift も検出しない」
 *    と明記。実測でも repo 外の行があろうと checksum が食い違おうと exit 0 で通る）
 *
 * 2 番が最重要。`COMMIT PREPARED` や `SAVEPOINT` を実行してしまうと、
 * リハーサルのつもりが**本当に適用**される。実挙動は
 * `__tests__/integration/prisma/migration-preconditions-rehearsal.test.ts` が
 * 実 DB で確かめる（落ちる migration・通る migration・巻き戻しの検証）。
 */

import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  describeError,
  historyMismatches,
  type Migration,
  pendingStatements,
  planStep,
  readMigrations,
  resolveUrl,
  splitStatements,
} from "../../../scripts/migration-preconditions";

const MIGRATIONS = readMigrations();

describe("migration リハーサルの前提", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS.map((m) => m.name)).toContain("00000000000000_init");
    // baseline は 1 文ではない。分割が壊れていれば気づける。
    const baseline = MIGRATIONS.find((m) => m.name === "00000000000000_init");
    expect(splitStatements(baseline?.sql ?? "").length).toBeGreaterThan(100);
  });

  describe("文の切り出し", () => {
    test("plpgsql 本体の `;` で割らない", () => {
      const statements = splitStatements(
        `CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK ("x" >= 0);`,
      );
      expect(statements).toHaveLength(2);
      expect(statements[0]).toStartWith("CREATE FUNCTION");
    });

    test("E'' のバックスラッシュ退避で切れ目を誤らない", () => {
      // 誤ると以降の DDL が 1 文に飲まれ、リハーサルから消える。
      const statements = splitStatements(
        `UPDATE "locations" SET "note" = E'it\\'s fine';
ALTER TABLE "locations" ADD CONSTRAINT "c" CHECK ("x" >= 0);`,
      );
      expect(statements).toHaveLength(2);
      expect(statements[1]).toStartWith("ALTER TABLE");
    });

    test("コメントは落とす", () => {
      expect(splitStatements(`-- 説明\nSELECT 1;\n/* 塊 */ SELECT 2;`)).toEqual(
        ["SELECT 1", "SELECT 2"],
      );
    });
  });

  describe("巻き戻せない文を実行しない", () => {
    test("包み用の BEGIN / COMMIT / END は読み飛ばす", () => {
      for (const sql of [
        "BEGIN",
        "BEGIN;",
        "START TRANSACTION",
        "COMMIT",
        "END",
      ]) {
        expect(planStep(sql.replace(/;$/u, "")).kind).toBe("skip");
      }
    });

    test("境界を壊す文は blocked にする", () => {
      // これらを実行すると、リハーサルのつもりが本当に適用される。
      const dangerous = [
        "ROLLBACK",
        "ABORT",
        "SAVEPOINT s1",
        "RELEASE SAVEPOINT s1",
        "PREPARE TRANSACTION 'x'",
        "COMMIT PREPARED 'x'",
        "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
      ];
      for (const sql of dangerous) {
        expect(planStep(sql).kind, sql).toBe("blocked");
      }
    });

    test("トランザクション内で実行できない文も blocked にする", () => {
      expect(planStep('CREATE INDEX CONCURRENTLY "i" ON "t"("c")').kind).toBe(
        "blocked",
      );
      expect(planStep('VACUUM "t"').kind).toBe("blocked");
    });

    test("普通の DDL / DML は run になる", () => {
      for (const sql of [
        'ALTER TABLE "t" ADD CONSTRAINT "c" CHECK ("x" >= 0)',
        'CREATE TABLE "t" ("id" text)',
        'UPDATE "t" SET "x" = 1',
        'CREATE INDEX "i" ON "t"("c")',
      ]) {
        expect(planStep(sql).kind, sql).toBe("run");
      }
    });
  });

  /**
   * squawk にも計画ダウンタイム判定にも該当しない一括削除。
   *
   * この 4 形は**リハーサルでも止まらない**——流して巻き戻せてしまうので
   * 「通った」と報告し、本番の migrate が本当に実行する。実測で確認した穴で、
   * `irreversibleDataLoss` はそこだけを塞ぐ。
   *
   * 判定は `planStep` 経由で確かめる。デプロイ経路（`pendingStatements`）も
   * `planStep` を呼ぶので、fixture と実走査が同じ関数を通る。
   */
  describe("網にかからない一括削除を拒否する", () => {
    test("TRUNCATE / WHERE 無し DELETE / DROP SCHEMA / 動的 SQL は blocked", () => {
      for (const sql of [
        'TRUNCATE "audit_logs"',
        'TRUNCATE TABLE "audit_logs" CASCADE',
        'DELETE FROM "reservations"',
        'DELETE FROM ONLY "reservations"',
        'DROP SCHEMA "public" CASCADE',
        "DO $$ BEGIN EXECUTE 'TRUNCATE audit_logs'; END $$",
      ]) {
        expect(planStep(sql).kind, sql).toBe("blocked");
      }
    });

    test("条件付きの削除と、対象を名指しする検査は通る", () => {
      // 何が消えるかは条件次第なので、そこは著者の検査の領分。
      for (const sql of [
        'DELETE FROM "reservations" WHERE "id" = \'r1\'',
        'UPDATE "t" SET "x" = 1',
        // 検査そのもの。EXECUTE を含まないので通る。
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM t) THEN RAISE EXCEPTION 'x'; END IF; END $$",
      ]) {
        expect(planStep(sql).kind, sql).toBe("run");
      }
    });

    test("TRUNCATE を禁じる trigger の定義は破壊ではない", () => {
      // 素朴な部分一致だと、防御の定義そのものが破壊に見える。
      // baseline はこの形を 4 つ持っているので、当たると baseline が流せなくなる。
      expect(
        planStep(
          'CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" ' +
            "FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate()",
        ).kind,
      ).toBe("run");
    });

    test("この repo の migration に blocked が無い", () => {
      // あると「流して確かめられない」ので適用前確認が手作業に戻る。
      const { blocked } = pendingStatements(MIGRATIONS, new Set());
      expect(
        blocked.map((entry) => `${entry.migration}: ${entry.reason}`),
      ).toEqual([]);
    });

    test("未適用だけが対象になる", () => {
      const all = pendingStatements(MIGRATIONS, new Set());
      const none = pendingStatements(
        MIGRATIONS,
        new Set(MIGRATIONS.map((m) => m.name)),
      );
      expect(all.steps.length).toBeGreaterThan(100);
      expect(none.steps).toEqual([]);
    });
  });

  describe("接続先の解決", () => {
    test("prisma.config.ts と同じ順（DIRECT_URL → DATABASE_URL）", () => {
      // 別の DB を見ていたら、確かめたことにならない。
      expect(
        resolveUrl([], { DIRECT_URL: "direct", DATABASE_URL: "pooled" }),
      ).toBe("direct");
      expect(resolveUrl([], { DATABASE_URL: "pooled" })).toBe("pooled");
      expect(resolveUrl([], { DIRECT_URL: "  ", DATABASE_URL: "pooled" })).toBe(
        "pooled",
      );
      expect(resolveUrl([], {})).toBeNull();
    });

    test("--url が env より優先される", () => {
      expect(resolveUrl(["--url", "explicit"], { DIRECT_URL: "direct" })).toBe(
        "explicit",
      );
    });
  });

  describe("エラーの説明", () => {
    test("PostgreSQL が言ったことを取り出す", () => {
      // Prisma は本当のメッセージを ``Invalid `prisma.$executeRawUnsafe()`
      // invocation:`` という前口上で包む。素朴に先頭行を取ると、デプロイを
      // 止められた運用者に出るのが前口上だけになる — `current transaction is
      // aborted` しか出ないのを直すための道具なのに、同じことをやってしまう。
      const prismaError = Object.assign(
        new Error(
          "\nInvalid `prisma.$executeRawUnsafe()` invocation:\n\n\nRaw query failed.",
        ),
        {
          meta: {
            driverAdapterError: {
              cause: {
                code: "23514",
                message:
                  'check constraint "locations_special_holidays_array_check" of relation "locations" is violated by some row',
              },
            },
          },
        },
      );

      expect(describeError(prismaError)).toBe(
        '23514: check constraint "locations_special_holidays_array_check" of relation "locations" is violated by some row',
      );
    });

    test("driver の情報が無ければ末尾の行を使う（前口上は先頭に来る）", () => {
      expect(describeError(new Error("preamble\n\nERROR: boom"))).toBe(
        "ERROR: boom",
      );
      expect(describeError(new Error(""))).toBe("（エラーメッセージなし）");
    });
  });
});

/**
 * `historyMismatches` は「DB の履歴が repo と同じ系譜か」だけを見る。
 *
 * ここが無いと、本番を新しい空 DB へ切り替える作業で**失敗が成功として表示される**。
 * 実測（2026-08-08）: 本番 DB は `_prisma_migrations` に 81 行あり repo には
 * baseline 1 本しか無いのに、`prisma migrate status` は `Database schema is up to
 * date!`、`migrate deploy` は `No pending migrations to apply.` を **exit 0** で返した。
 * checksum を書き換えても同じだった。Prisma 公式もそう書いている。
 */
describe("履歴が repo と同じ系譜を指しているか", () => {
  const sha = (sql: string) => createHash("sha256").update(sql).digest("hex");

  // fixture の名前に timestamp 形を使わない（`gates-do-not-pin-migrations.test.ts`）。
  // `historyMismatches` は名前を Map のキーとしてしか見ないので、形は判定に無関係。
  const REPO: readonly Migration[] = [
    { name: "00000000000000_init", sql: "CREATE TABLE a ();" },
    { name: "fixture_add_b", sql: "CREATE TABLE b ();" },
  ];
  const appliedAs = (name: string, sql: string) => ({
    name,
    checksum: sha(sql),
  });

  test("DB にあって repo に無い migration を落とす（畳んだ baseline を旧 DB に当てた形）", () => {
    const mismatches = historyMismatches(REPO, [
      appliedAs("00000000000000_init", "CREATE TABLE a ();"),
      {
        name: "fixture_only_in_db",
        checksum: sha("CREATE TABLE gone ();"),
      },
    ]);

    expect(mismatches.map((entry) => entry.migration)).toEqual([
      "fixture_only_in_db",
    ]);
    expect(mismatches[0]?.reason).toContain("repo の prisma/migrations に無い");
  });

  test("同名でも checksum が食い違えば落とす", () => {
    const mismatches = historyMismatches(REPO, [
      { name: "00000000000000_init", checksum: sha("CREATE TABLE other ();") },
    ]);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.migration).toBe("00000000000000_init");
    expect(mismatches[0]?.reason).toContain("checksum が食い違う");
  });

  test("空の DB は通る（履歴が 1 行も無い＝これから baseline を流す）", () => {
    expect(historyMismatches(REPO, [])).toEqual([]);
  });

  test("一部だけ適用済みでも、記録が実ファイルと一致していれば通る", () => {
    expect(
      historyMismatches(REPO, [
        appliedAs("00000000000000_init", "CREATE TABLE a ();"),
      ]),
    ).toEqual([]);
  });

  test("全部適用済みで一致していれば通る", () => {
    expect(
      historyMismatches(REPO, [
        appliedAs("00000000000000_init", "CREATE TABLE a ();"),
        appliedAs("fixture_add_b", "CREATE TABLE b ();"),
      ]),
    ).toEqual([]);
  });

  test("実 repo の migrations を自分自身と照合すると通る（checksum 計算の自己検査）", () => {
    // fixture の合成文字列だけで固定すると、`readMigrations` が返す `sql` と
    // `_prisma_migrations.checksum` の計算が食い違っていても気づけない。
    // 実ファイルを通す経路をここで 1 本持つ。
    const selfApplied = MIGRATIONS.map((migration) => ({
      name: migration.name,
      checksum: sha(migration.sql),
    }));

    expect(historyMismatches(MIGRATIONS, selfApplied)).toEqual([]);
    expect(selfApplied.length).toBeGreaterThan(0);
  });
});
