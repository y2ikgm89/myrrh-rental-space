/**
 * シングルトン行モデルの単一行強制ゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   `id` が `@default("singleton")` のモデルは、DB 側の CHECK 制約で 2 行目を拒否する。
 *
 * 書込側は全て `upsert({ where: { id: "singleton" } })` を通るが、それは規律であって
 * 制約ではない。素の `create()` が 1 箇所入れば 2 行目が生まれ、id を指定せずに読む
 * `findFirst` / `findFirstOrThrow` の呼び出し（tax.ts / organization.ts /
 * public-queries.ts / calendar-sync.ts / admin-queries.ts / media/references.ts）が
 * 物理行順でどちらかを返す。どちらが返るかは UPDATE のたびに変わりうるので、
 * 「設定が無言で切り替わる」という追跡困難な壊れ方をする。
 *
 * 対象モデルは schema.prisma から動的に読む。**Settings 系モデルを新設したときに
 * このテストが自動で対象を増やす**ため、CHECK の付け忘れは実装者が何もしなくても
 * 検出される（allowlist を書き足す方式だと付け忘れと同時に allowlist も忘れる）。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration（test-db を自動起動 + migrate deploy）
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

const SINGLETON_ID = "singleton";

type SingletonModel = { readonly model: string; readonly table: string };

/** schema.prisma から `@default("singleton")` を持つモデルと実テーブル名を抽出する。 */
async function readSingletonModels(): Promise<readonly SingletonModel[]> {
  const schema = await readFile(
    join(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );
  const models: SingletonModel[] = [];
  for (const block of schema.split(/\nmodel /u).slice(1)) {
    if (!block.includes(`@default("${SINGLETON_ID}")`)) continue;
    const model = block.split(/[\s{]/u)[0];
    const mapped = /@@map\("([^"]+)"\)/u.exec(block);
    if (!model || !mapped?.[1]) {
      throw new Error(
        `singleton モデル ${model ?? "(名前不明)"} に @@map がありません。テーブル名を解決できません。`,
      );
    }
    models.push({ model, table: mapped[1] });
  }
  return models;
}

let client: Client;
let singletonModels: readonly SingletonModel[];

beforeAll(async () => {
  singletonModels = await readSingletonModels();
  const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe("singleton 行モデルの DB ガード", () => {
  test("schema.prisma から singleton モデルを検出できている", () => {
    // 抽出が壊れて 0 件になると以降の test が空回りで緑になる（vacuous pass 防止）。
    // ReceiptSequence は年キーへ移り、singleton ではなくなった
    // （21 → 20）。Settings 系を新設したときはこの下限も上げる。
    expect(singletonModels.length).toBeGreaterThanOrEqual(20);
  });

  test("全 singleton テーブルで 2 行目 INSERT が拒否される", async () => {
    const failures: string[] = [];

    for (const { model, table } of singletonModels) {
      await client.query("BEGIN");
      let rejection: string | null = null;
      try {
        await client.query(
          `INSERT INTO "${table}" ("id", created_at, updated_at)
           VALUES ($1, now(), now())`,
          ["not-singleton"],
        );
      } catch (error) {
        // 全モデルの拒否を収集して最後にまとめて報告するため try/catch で受ける
        // （fail-fast の .rejects だとどのモデルで壊れたかが出にくい）。
        rejection = error instanceof Error ? error.message : String(error);
      } finally {
        await client.query("ROLLBACK");
      }

      if (rejection === null) {
        failures.push(`${model} (${table}): 2 行目 INSERT が通った`);
        continue;
      }
      if (!rejection.includes(`${table}_singleton_check`)) {
        failures.push(
          `${model} (${table}): 拒否理由が singleton CHECK ではない — ${rejection}`,
        );
      }
    }

    expect({
      failures,
      hint:
        failures.length > 0
          ? `新しい singleton モデルには ALTER TABLE "<table>" ADD CONSTRAINT "<table>_singleton_check" CHECK ("id" = 'singleton'); を追加する migration が必要です`
          : "",
    }).toEqual({ failures: [], hint: "" });
  });
});
