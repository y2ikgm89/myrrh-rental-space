/**
 * enum 列で並べ替えているコードが、**その enum の宣言順に依存している**ことを
 * 明示し、順序が動いたら落ちるようにする gate。
 *
 * ## なぜ要るのか
 *
 * PostgreSQL の enum は**宣言順**でソートする。だから `orderBy: { <enum列>: "asc" }`
 * と書いた瞬間、schema.prisma の値の並びが**アプリの挙動そのもの**になる。
 * 並べ替え・値の挿入は型検査にもテストにも引っかからないのに、順序だけが変わる。
 *
 * 既に 2 箇所ある:
 *
 * | 使っている場所 | 依存している順序 | 変わると |
 * | --- | --- | --- |
 * | `reservations/availability.ts`（休業日 cascade） | `GLOBAL` < `LOCATION` < `SPACE` | 全社休業日よりスペース単位の理由が優先され、**表示される休業理由が変わる** |
 * | `events/waitlist-queries.ts`（キャンセル待ち一覧） | `WAITLISTED` < `WAITLISTED_OFFERED` | オファー済みが待機中より下に沈み、**管理者が見落として 24 時間の期限が切れる** |
 *
 * 前者は実 DB テスト（`cascade-priority.test.ts`）が守っていたが、**後者は
 * 何も守っていなかった**。1 つ目を見つけたのは偶然で、2 つ目はこの gate が
 * 機械的に見つけた。
 *
 * ## 母集合は「enum 列 × orderBy」
 *
 * 免除リストではなく、schema.prisma の enum 列と src の `orderBy` の交差を取る。
 * enum 列で並べ替えるコードを新しく書くと、依存する順序を宣言するまで赤くなる。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: enum 列で並べ替えている箇所がすべて宣言されており、宣言した
 * 「この値はこの値より先」が schema.prisma の宣言順と一致する。
 *
 * **証明しない**: その順序がプロダクトとして正しいこと。`asc` / `desc` の
 * 取り違えもここでは分からない。休業日 cascade はその先まで
 * `__tests__/integration/domain/blocked-dates/cascade-priority.test.ts` が
 * 実際に行を入れて確かめている。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();

/** enum 型の名前 → 宣言順の値。 */
function enumDeclarations(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const schema = readPrismaSchema();
  for (const block of schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gmu)) {
    const name = block[1];
    const body = block[2];
    if (!name || body === undefined) continue;
    const values: string[] = [];
    for (const raw of body.split(/\r?\n/u)) {
      const line = raw.replace(/\/\/.*$/u, "").trim();
      if (!line || line.startsWith("@@") || line.startsWith("///")) continue;
      const value = /^(\w+)/u.exec(line)?.[1];
      if (value) values.push(value);
    }
    out.set(name, values);
  }
  return out;
}

const ENUMS = enumDeclarations();

/** enum 型が付いた列の field 名 → その enum 型名（複数モデルで同名なら全部）。 */
function enumBackedFields(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let model: string | null = null;
  for (const raw of readPrismaSchema().split(/\r?\n/u)) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;
    const decl = /^\s*(\w+)\s+(\w+)(\[\])?\??/u.exec(line);
    if (!decl?.[1] || !decl[2] || !ENUMS.has(decl[2])) continue;
    const bucket = out.get(decl[1]) ?? new Set<string>();
    bucket.add(decl[2]);
    out.set(decl[1], bucket);
  }
  return out;
}

const ENUM_FIELDS = enumBackedFields();

interface OrderByUse {
  readonly file: string;
  readonly field: string;
}

/** src の `orderBy: { <enum列>: ... }`（配列形式も含む）。 */
function enumOrderByUses(): OrderByUse[] {
  const files = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const uses: OrderByUse[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    if (!source.includes("orderBy")) continue;
    for (const m of source.matchAll(/orderBy:\s*(?:\[\s*)?\{\s*(\w+)\s*:/gu)) {
      const field = m[1];
      if (field && ENUM_FIELDS.has(field)) uses.push({ file, field });
    }
  }
  return uses;
}

const USES = enumOrderByUses();

/**
 * enum 列で並べ替えている箇所と、**そこが依存している値の前後関係**。
 *
 * `before` が `after` より先に宣言されていることを検査する。`asc` / `desc` の
 * どちらで使うかは呼び出し側の都合なので、ここでは「宣言順がこうである」だけを固定する。
 */
const ORDER_DEPENDENCIES: readonly {
  readonly file: string;
  readonly field: string;
  readonly enumName: string;
  readonly before: string;
  readonly after: string;
  readonly why: string;
}[] = [
  {
    file: "src/shared/domain/reservations/availability.ts",
    field: "scope",
    enumName: "BlockedDateScope",
    before: "GLOBAL",
    after: "LOCATION",
    why: '`orderBy: { scope: "asc" }` で最優先の休業理由を採る。逆転すると全社休業日よりスペース単位の理由が表示される',
  },
  {
    file: "src/shared/domain/reservations/availability.ts",
    field: "scope",
    enumName: "BlockedDateScope",
    before: "LOCATION",
    after: "SPACE",
    why: "同上（3 階層 cascade の 2 段目と 3 段目）",
  },
  {
    file: "src/shared/domain/events/waitlist-queries.ts",
    field: "status",
    enumName: "RegistrationStatus",
    before: "WAITLISTED",
    after: "WAITLISTED_OFFERED",
    why: '`orderBy: [{ status: "desc" }]` でオファー済みを先頭に出す。逆転するとオファー済みが待機中より下に沈み、管理者が見落として 24 時間の期限が切れる',
  },
];

function declaredIndex(enumName: string, value: string): number {
  return ENUMS.get(enumName)?.indexOf(value) ?? -1;
}

describe("enum 列での並べ替えは宣言順に依存する", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // どれかが 0 になると以降が全部 vacuous に通る。
    expect(ENUMS.size).toBeGreaterThan(30);
    expect(ENUM_FIELDS.size).toBeGreaterThan(20);
    expect(USES.length).toBeGreaterThan(0);
    // 値の読み取りが機能していること（コメント行を値と取り違えていない）。
    expect(ENUMS.get("BlockedDateScope")).toEqual([
      "GLOBAL",
      "LOCATION",
      "SPACE",
    ]);
  });

  test("enum 列で並べ替えている箇所がすべて宣言されている", () => {
    const declared = new Set(
      ORDER_DEPENDENCIES.map((d) => `${d.file}::${d.field}`),
    );
    const undeclared = [...new Set(USES.map((u) => `${u.file}::${u.field}`))]
      .filter((k) => !declared.has(k))
      .map(
        (k) =>
          `${k}: enum 列で並べ替えている。PostgreSQL は宣言順でソートするので、` +
          `依存している値の前後関係を ORDER_DEPENDENCIES に宣言する`,
      );

    expect(undeclared).toEqual([]);
  });

  test("宣言した前後関係が schema.prisma の宣言順と一致する", () => {
    const violations = ORDER_DEPENDENCIES.flatMap((d) => {
      const beforeAt = declaredIndex(d.enumName, d.before);
      const afterAt = declaredIndex(d.enumName, d.after);
      if (beforeAt === -1 || afterAt === -1) {
        return [
          `${d.enumName}: ${d.before} / ${d.after} のどちらかが宣言に無い（改名・削除された）`,
        ];
      }
      return beforeAt < afterAt
        ? []
        : [
            `${d.enumName}: ${d.before} が ${d.after} より後ろに宣言されている。${d.why}`,
          ];
    });

    expect(violations).toEqual([]);
  });

  test("宣言が実在する箇所を指している", () => {
    const actual = new Set(USES.map((u) => `${u.file}::${u.field}`));
    const stale = ORDER_DEPENDENCIES.map((d) => `${d.file}::${d.field}`)
      .filter((k) => !actual.has(k))
      .map((k) => `${k}: もう enum 列で並べ替えていない。宣言を外すこと`);

    expect([...new Set(stale)]).toEqual([]);
  });
});
