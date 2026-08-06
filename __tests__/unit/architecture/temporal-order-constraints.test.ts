/**
 * 期間を表す列の組が「開始 <= 終了」を DB で強制していることの gate。
 *
 * ## 何が守られていなかったか
 *
 * 逆転した期間は**保存できるのに一度も効かない**。範囲判定は
 * `start <= target AND end >= target` の形なので、start > end だと常に false になる。
 * 管理者の画面では「保存できた」ように見えるので、報告が上がるまで分からない。
 *
 * | 表 | 逆転すると |
 * | --- | --- |
 * | `blocked_dates` | 全社休業日を入れても**その日に予約が入る** |
 * | `coupons` | クーポンが**永久に使えない** |
 * | `announcement_bars` | 告知が**一度も表示されない** |
 *
 * `reservations` / `event_time_slots` には既に制約があり、`space_rate_plans` にも
 * `effective_from`/`effective_to`（日付の対）の制約があった。「順序制約はある」と
 * いう主張を検証する仕組みが無かったので、非対称に誰も気づけなかった。
 *
 * ## 母集合は名前の組から機械的に作る
 *
 * 免除リストではなく `startX`/`endX`・`validFrom`/`validUntil` といった**対の形**を
 * schema.prisma から拾う。期間を持つモデルを新設すると、宣言するまで赤くなる。
 *
 * この gate を書くきっかけになった監査では、私が pg_catalog を
 * `format_type = 'timestamp with time zone'` で引いて**実際の
 * `timestamp(6) with time zone` を取りこぼし**、6 組中 4 組を見落とした。
 * 型名で引くのをやめ、schema.prisma の宣言を読む。
 *
 * **その後、同じ間違いを別の形でやっていた**: 宣言の読み取りが `DateTime` 限定
 * だったため、`"HH:MM"` を `VarChar(5)` で持つ `SpaceRatePlan.startTime`/`endTime` が
 * 母集合に入る余地が構造的に無く、順序制約が 1 本も無いことに気づけなかった。
 * 今は型で絞らず、対の両端が**同じ型**であることだけを条件にする。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 対になっている列の組がすべて分類され、順序制約を持つと宣言した組は
 * その制約が invariants.sql に実在し、両方の列を参照している。
 *
 * **証明しない**: 述語の向き（`<=` か `>=` か）。名前と参照列までしか見ない。
 * 向きは `__tests__/integration/prisma/value-domain-constraints.test.ts` が
 * 逆転した行を実際に INSERT して確かめる。**宣言と実測は同じ定数
 * （`__tests__/support/temporal-order-constraints.ts`）を読む**ので、ここに 1 行
 * 足して probe を書かないと tsc:test がコンパイルエラーで落ちる
 * （前は宣言 8 本に対して probe が 4 本しか無く、残り 4 本は述語を恒真式に
 * 書き換えても全部緑のまま通っていた）。
 */

import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPrismaSchema,
} from "../../support/prisma-sources";
import { ORDER_CONSTRAINTS } from "../../support/temporal-order-constraints";

interface Column {
  readonly model: string;
  readonly field: string;
  readonly column: string;
  readonly type: string;
}

function snakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

/**
 * schema.prisma の列宣言を物理名・型つきで集める。
 *
 * **型で絞らない。** 前身は `DateTime` の宣言しか読まなかったため、
 * `VarChar(5)` の `"HH:MM"` で期間を持つ `SpaceRatePlan.startTime` /
 * `endTime` が母集合に入る余地が構造的に無く、順序制約が 1 本も無いことに
 * 誰も気づけなかった。期間を時刻文字列で持つか timestamp で持つかは
 * 表現の選択であって、「開始 <= 終了」が要るかどうかとは関係がない。
 *
 * 対の判定は「同じモデル・同じ型・名前が対の形」の 3 つで行う（下記 findPairs）。
 * 順序を表せない型（Boolean など）の対が出てきたら赤くなる — そこは人が見る。
 */
function readColumns(): Column[] {
  const out: Column[] = [];
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

    const decl = /^\s*(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1] || !decl[2] || decl[3] === "[]") continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(decl[4] ?? "")?.[1];

    out.push({
      model,
      field: decl[1],
      column: mapped ?? snakeCase(decl[1]),
      type: decl[2],
    });
  }
  return out;
}

/**
 * 「開始」の名前から「終了」の名前を導く規則。
 *
 * 名前で組を見つけるので、規則に載っていない綴りの組は見つからない。
 * 新しい綴りを使うなら**ここに足す**（足さないと黙って対象外になる）。
 */
const PAIR_RULES: readonly {
  readonly start: RegExp;
  readonly end: (captured: string) => string;
}[] = [
  { start: /^start(.*)$/u, end: (rest) => `end${rest}` },
  { start: /^validFrom$/u, end: () => "validUntil" },
  { start: /^effectiveFrom$/u, end: () => "effectiveTo" },
  // 非正規化キャッシュ（`first<X>StartAt` / `last<X>EndAt`）
  { start: /^first(.*)StartAt$/u, end: (rest) => `last${rest}EndAt` },
];

interface Pair {
  readonly model: string;
  readonly startColumn: string;
  readonly endColumn: string;
}

function findPairs(): Pair[] {
  const byModel = new Map<string, Map<string, Column>>();
  for (const c of readColumns()) {
    const bucket = byModel.get(c.model) ?? new Map<string, Column>();
    bucket.set(c.field, c);
    byModel.set(c.model, bucket);
  }

  const pairs: Pair[] = [];
  for (const [model, fields] of byModel) {
    for (const [field, start] of fields) {
      for (const rule of PAIR_RULES) {
        const match = rule.start.exec(field);
        if (!match) continue;
        const end = fields.get(rule.end(match[1] ?? ""));
        // 型が違う組は「期間の両端」ではない（relation field の取り違えを弾く）。
        if (end === undefined || end.type !== start.type) continue;
        pairs.push({
          model,
          startColumn: start.column,
          endColumn: end.column,
        });
      }
    }
  }
  return pairs;
}

const PAIRS = findPairs();

/** invariants.sql の CHECK（制約名 → 式）。 */
function checkDefinitions(): Map<string, string> {
  const out = new Map<string, string>();
  const pattern =
    /ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "([a-z_]+)" CHECK \((.*)\);/gu;
  for (const m of readDatabaseInvariants().matchAll(pattern)) {
    if (m[2] && m[3]) out.set(m[2], m[3]);
  }
  return out;
}

const CHECKS = checkDefinitions();

/** 宣言（`__tests__/support/temporal-order-constraints.ts`）を名前引きできる形に。 */
const DECLARED = new Map<string, string>(Object.entries(ORDER_CONSTRAINTS));

function key(p: Pair): string {
  return `${p.model}.${p.startColumn}`;
}

describe("期間の列は順序が DB で強制されている", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // 対を 1 組も拾えていないと以降が全部 vacuous に通る。
    expect(PAIRS.length).toBeGreaterThanOrEqual(9);
    expect(CHECKS.size).toBeGreaterThan(50);
    // 既知の組を名指しで固定する（命名規則の変換が壊れたらここで落ちる）。
    expect(PAIRS.map(key)).toContain("Reservation.start_time");
    expect(PAIRS.map(key)).toContain("Coupon.valid_from");
    // DateTime 以外の型で期間を持つ組も母集合に入っている（型で絞らないことの自己検査）。
    expect(PAIRS.map(key)).toContain("SpaceRatePlan.start_time");
  });

  test("すべての期間の組が順序制約を宣言している", () => {
    const undeclared = PAIRS.filter((p) => !DECLARED.has(key(p))).map(
      (p) =>
        `${p.model}: ${p.startColumn} と ${p.endColumn} の順序を守る CHECK が宣言されていない。` +
        `逆転すると「保存できるのに一度も効かない」状態になる`,
    );

    expect(undeclared).toEqual([]);
  });

  test("宣言した制約が実在し、両方の列を参照している", () => {
    const failures = PAIRS.flatMap((p) => {
      const name = DECLARED.get(key(p));
      if (name === undefined) return [];
      const definition = CHECKS.get(name);
      if (definition === undefined) {
        return [`${key(p)}: 制約 ${name} が invariants.sql に無い`];
      }
      const missing = [p.startColumn, p.endColumn].filter(
        (col) => !new RegExp(`\\b${col}\\b`, "u").test(definition),
      );
      return missing.length === 0
        ? []
        : [`${name}: ${missing.join(" / ")} を参照していない — ${definition}`];
    });

    expect(failures).toEqual([]);
  });

  test("宣言に実在しない組が残っていない", () => {
    const known = new Set(PAIRS.map(key));
    const stale = Object.keys(ORDER_CONSTRAINTS).filter((k) => !known.has(k));

    expect(stale).toEqual([]);
  });
});
