/**
 * `scripts/db-census.ts` の純粋関数のテスト。
 *
 * このツールは migration 履歴を 1 本の baseline へ畳む作業の**唯一の安全網**なので、
 * 「差分があるのに無いと言う」壊れ方を絶対に許さない。特に:
 *
 * - 変更行を「変更」として畳まず removed + added の両方で出す（部分一致で寄せると
 *   別物を同一視しうる）
 * - 除外テーブルの判定を先頭一致にしない（`_prisma_migrations_backup` のような
 *   別テーブルを巻き込む）
 * - 片方にしか無いセクションを見落とさない
 */

import { describe, test, expect } from "bun:test";
import {
  CENSUS_SECTIONS,
  diffCensus,
  formatCensusDiff,
  normalizeCensusRows,
  parseArgs,
  validateCensus,
} from "../../../scripts/db-census";

/** 全セクションを持つ最小の正当なセンサス。 */
function fullCensus(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const section of CENSUS_SECTIONS) base[section] = [];
  return { ...base, ...overrides };
}

describe("diffCensus", () => {
  test("完全一致なら差分ゼロ", () => {
    const census = { tables: ["a", "b"], enums: ["e = X, Y"] };
    expect(diffCensus(census, census)).toEqual([]);
  });

  test("追加・削除をセクション単位で報告する", () => {
    const diffs = diffCensus({ tables: ["a", "b"] }, { tables: ["b", "c"] });
    expect(diffs).toEqual([
      { section: "tables", added: ["c"], removed: ["a"] },
    ]);
  });

  test("行の変更は removed + added の両方で現れる", () => {
    const diffs = diffCensus(
      { constraints: ["t c CHECK (x > 0)"] },
      { constraints: ["t c CHECK (x >= 0)"] },
    );
    expect(diffs[0]?.removed).toEqual(["t c CHECK (x > 0)"]);
    expect(diffs[0]?.added).toEqual(["t c CHECK (x >= 0)"]);
  });

  test("enum の値の順序が変わったら差分になる（PostgreSQL は宣言順でソートする）", () => {
    const diffs = diffCensus(
      { enums: ["scope = GLOBAL, LOCATION, SPACE"] },
      { enums: ["scope = SPACE, LOCATION, GLOBAL"] },
    );
    expect(diffs).toHaveLength(1);
  });

  test("片方にしか無いセクションを見落とさない", () => {
    expect(diffCensus({}, { triggers: ["t"] })).toEqual([
      { section: "triggers", added: ["t"], removed: [] },
    ]);
    expect(diffCensus({ triggers: ["t"] }, {})).toEqual([
      { section: "triggers", added: [], removed: ["t"] },
    ]);
  });

  test("差分が無いセクションは出力に含めない", () => {
    const diffs = diffCensus(
      { tables: ["a"], enums: ["e = X"] },
      { tables: ["a"], enums: ["e = Y"] },
    );
    expect(diffs.map((d) => d.section)).toEqual(["enums"]);
  });
});

describe("formatCensusDiff", () => {
  test("差分ゼロを明示する", () => {
    expect(formatCensusDiff([])).toContain("差分なし");
  });

  test("削除は -、追加は + で出す", () => {
    const text = formatCensusDiff([
      { section: "functions", added: ["new()"], removed: ["old()"] },
    ]);
    expect(text).toContain("- old()");
    expect(text).toContain("+ new()");
  });
});

describe("normalizeCensusRows", () => {
  test("null を落とす", () => {
    expect(normalizeCensusRows(["a", null, "b"])).toEqual(["a", "b"]);
  });

  test("重複を潰してソートする", () => {
    expect(normalizeCensusRows(["b", "a", "b"])).toEqual(["a", "b"]);
  });

  test("_prisma_migrations は除外する（履歴そのものなので畳めば必ず変わる）", () => {
    expect(
      normalizeCensusRows([
        "_prisma_migrations",
        "_prisma_migrations.checksum text NOT NULL",
        "reservations",
      ]),
    ).toEqual(["reservations"]);
  });

  test("識別子の境界で判定する — 名前が前方一致するだけの別テーブルは残す", () => {
    expect(
      normalizeCensusRows([
        "_prisma_migrations_backup",
        "my_prisma_migrations",
      ]),
    ).toEqual(["_prisma_migrations_backup", "my_prisma_migrations"]);
  });
});

describe("validateCensus", () => {
  test("全セクションが揃っていれば通る", () => {
    const result = validateCensus(fullCensus({ tables: ["reservations"] }));
    expect(result.ok).toBe(true);
  });

  test("空オブジェクトを拒否する — これを通すと生成失敗どうしの diff が「一致」になる", () => {
    const result = validateCensus({});
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain("セクション不足");
  });

  test("配列を拒否する", () => {
    expect(validateCensus([]).ok).toBe(false);
  });

  test("null を拒否する", () => {
    expect(validateCensus(null).ok).toBe(false);
  });

  test("セクションが 1 つでも欠けたら拒否する", () => {
    const partial = fullCensus();
    delete partial["triggers"];
    const result = validateCensus(partial);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain("triggers");
  });

  test("知らないセクションがあれば拒否する（形式の drift を検出する）", () => {
    const result = validateCensus(fullCensus({ bogus: [] }));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain("bogus");
  });

  test("string でない要素を含む配列を拒否する", () => {
    const result = validateCensus(fullCensus({ tables: ["ok", 42] }));
    expect(result.ok).toBe(false);
  });

  test("セクションが配列でなければ拒否する", () => {
    expect(validateCensus(fullCensus({ tables: "reservations" })).ok).toBe(
      false,
    );
  });
});

describe("parseArgs", () => {
  test("--diff は 2 ファイルを取る", () => {
    expect(parseArgs(["--diff", "a.json", "b.json"])).toEqual({
      mode: "diff",
      before: "a.json",
      after: "b.json",
    });
  });

  test("--diff の引数が足りなければ error", () => {
    expect(parseArgs(["--diff", "a.json"]).mode).toBe("error");
  });

  test("--url と --out で capture", () => {
    expect(parseArgs(["--url", "postgres://x", "--out", "o.json"])).toEqual({
      mode: "capture",
      url: "postgres://x",
      out: "o.json",
    });
  });

  test("--out が無ければ error", () => {
    expect(parseArgs(["--url", "postgres://x"]).mode).toBe("error");
  });

  test("引数なしは error", () => {
    expect(parseArgs([]).mode).toBe("error");
  });
});
