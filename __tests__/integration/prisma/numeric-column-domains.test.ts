/**
 * 宣言した値域が**実 DB の述語として**その通りに効いていることの検査。
 *
 * ## なぜ「制約がある」だけでは足りないか
 *
 * `__tests__/unit/architecture/numeric-column-domains.test.ts` は「その列を参照する
 * CHECK が invariants.sql にある」ことしか見ない。**中身が `1 = 1` でも通る。**
 * 逆にここだけだと「列が増えたのに誰も見ていない」を見逃す。両方で挟む。
 *
 * ## 親行を作らずに述語だけを試す
 *
 * 55 本ぶんの fixture（拠点 → スペース → 顧客 → …）を組むのは現実的でないし、
 * **CI の test DB は migrate 済みだが seed されていない**ので既存行も借りられない。
 *
 * そこで `pg_get_constraintdef` で実 DB の制約定義をそのまま読み、**同じ列名の
 * 一時表へ写して**境界値を入れる。写した式は本物のバイト列なので「本物と同じ述語か」
 * は疑う余地がない。NOT NULL も FK も付いてこないため DB の中身に一切依存しない。
 *
 * ## 上下の両方を見る
 *
 * `rejected` だけを見ると `CHECK (false)` でも緑になり、`accepted` だけだと
 * `CHECK (true)` でも緑になる。境界のすぐ内側と外側を必ず対で確かめる。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

import {
  COMPOSITE_PROBE_DEFAULTS,
  boundaryValues,
  constraintNameFor,
  numericBoundaryTargets,
  type NumericColumn,
} from "../../support/numeric-column-domains";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

let client: Client;

beforeAll(async () => {
  const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

const TARGETS = numericBoundaryTargets();

/** 実 DB から制約定義（`CHECK (...)`）と列の型を読む。 */
async function loadConstraint(
  table: string,
  constraintName: string,
  column: NumericColumn,
  key: string,
): Promise<{
  readonly definition: string;
  readonly dataTypes: ReadonlyMap<string, string>;
} | null> {
  // **`::text` を外さない。** `conname` は `name` 型（63 バイト）なので、
  // 素の `conname = $2` は**引数側も 63 バイトへ切り詰めてから**比較する。
  // 実測: 76 文字の名前で引いたとき、DB 側の切り詰め済み名と一致してしまい
  // 「名前は違うのに見つかる」偽の緑になった（この検査自体が一度これで通った）。
  const def = await client.query<{ readonly def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname::text = $1 AND c.conname::text = $2 AND c.contype = 'c'`,
    [table, constraintName],
  );
  const definition = def.rows[0]?.def;
  if (definition === undefined) return null;

  const probeDefaults = COMPOSITE_PROBE_DEFAULTS[key];
  const columns =
    probeDefaults === undefined
      ? [column.column]
      : [...new Set([column.column, ...Object.keys(probeDefaults)])];

  const dataTypes = new Map<string, string>();
  for (const col of columns) {
    const type = await client.query<{ readonly data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, col],
    );
    const dataType = type.rows[0]?.data_type;
    if (dataType === undefined) return null;
    dataTypes.set(col, dataType);
  }

  return { definition, dataTypes };
}

/**
 * 本物の制約式を写した一時表へ値を入れ、通ったかどうかを返す。
 *
 * 一時表の列名は本物と同じにする。そうしないと写した式が解決できない。
 */
async function accepts(
  column: NumericColumn,
  dataTypes: ReadonlyMap<string, string>,
  definition: string,
  value: number,
  key: string,
): Promise<boolean> {
  const probeDefaults = COMPOSITE_PROBE_DEFAULTS[key];
  const columns =
    probeDefaults === undefined
      ? [column.column]
      : [...new Set([column.column, ...Object.keys(probeDefaults)])];

  await client.query("BEGIN");
  try {
    const colDefs = columns
      .map((col) => {
        const type = dataTypes.get(col);
        if (type === undefined) {
          throw new Error(`probe column type missing: ${col}`);
        }
        return `"${col}" ${type}`;
      })
      .join(", ");
    await client.query(`CREATE TEMP TABLE probe (${colDefs}) ON COMMIT DROP`);
    await client.query(
      `ALTER TABLE probe ADD CONSTRAINT probe_c ${definition}`,
    );

    const insertCols = columns.map((col) => `"${col}"`).join(", ");
    const insertParams: unknown[] = [];
    const valueExprs: string[] = [];
    for (const col of columns) {
      const val =
        col === column.column
          ? value
          : probeDefaults !== undefined && col in probeDefaults
            ? probeDefaults[col]
            : 0;
      if (val === null) {
        valueExprs.push("NULL");
      } else {
        insertParams.push(val);
        valueExprs.push(`$${insertParams.length}`);
      }
    }
    await client.query(
      `INSERT INTO probe (${insertCols}) VALUES (${valueExprs.join(", ")})`,
      insertParams,
    );
    return true;
  } catch {
    return false;
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("宣言した値域が実 DB で効いている", () => {
  test("宣言した列が schema.prisma と実 DB の両方に実在する", async () => {
    const rows = await client.query<{
      readonly table_name: string;
      readonly column_name: string;
    }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    // パースが壊れると以降が全部 vacuous に通る。
    expect(rows.rows.length).toBeGreaterThan(300);
    expect(TARGETS.length).toBeGreaterThan(50);

    const live = new Set(
      rows.rows.map((r) => `${r.table_name}.${r.column_name}`),
    );
    const missing = TARGETS.flatMap(([k, column]) => {
      if (!column) return [`${k}: schema.prisma に無い`];
      const physical = `${column.table}.${column.column}`;
      return live.has(physical) ? [] : [`${k}: 実 DB に ${physical} が無い`];
    });

    expect(missing).toEqual([]);
  });

  test("境界のすぐ内側は通り、外側は弾かれる", async () => {
    const failures: string[] = [];

    for (const [k, column, domain] of TARGETS) {
      if (!column) continue; // 上のテストが名指しで落とす
      const constraintName = constraintNameFor(column, domain);
      const loaded = await loadConstraint(
        column.table,
        constraintName,
        column,
        k,
      );
      if (!loaded) {
        failures.push(`${k}: ${constraintName} を実 DB から読めない`);
        continue;
      }

      const { accepted, rejected } = boundaryValues(domain, k);
      for (const value of accepted) {
        if (
          !(await accepts(
            column,
            loaded.dataTypes,
            loaded.definition,
            value,
            k,
          ))
        ) {
          failures.push(`${k}: ${value} が弾かれた（通るべき値）`);
        }
      }
      for (const value of rejected) {
        if (
          await accepts(column, loaded.dataTypes, loaded.definition, value, k)
        ) {
          failures.push(`${k}: ${value} が通った（弾くべき値）`);
        }
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);
});
