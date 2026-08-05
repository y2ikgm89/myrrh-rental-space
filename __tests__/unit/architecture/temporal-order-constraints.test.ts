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
 * `reservations` / `event_time_slots` / `space_rate_plans` には既に制約があり、
 * **この 3 つだけが抜けていた**。「順序制約はある」という主張を検証する仕組みが
 * 無かったので、非対称に誰も気づけなかった。
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
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 対になっている列の組がすべて分類され、順序制約を持つと宣言した組は
 * その制約が invariants.sql に実在し、両方の列を参照している。
 *
 * **証明しない**: 述語の向き（`<=` か `>=` か）。名前と参照列までしか見ない。
 * 向きは `__tests__/integration/prisma/value-domain-constraints.test.ts` が
 * 実際に逆転した行を INSERT して確かめる。
 */

import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPrismaSchema,
} from "../../support/prisma-sources";

interface DateTimeColumn {
  readonly model: string;
  readonly field: string;
  readonly column: string;
}

function snakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

/** schema.prisma の `DateTime` 列を物理名つきで集める。 */
function readDateTimeColumns(): DateTimeColumn[] {
  const out: DateTimeColumn[] = [];
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

    const decl = /^\s*(\w+)\s+DateTime(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1] || decl[2] === "[]") continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(decl[3] ?? "")?.[1];

    out.push({
      model,
      field: decl[1],
      column: mapped ?? snakeCase(decl[1]),
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
  const columns = readDateTimeColumns();
  const byModel = new Map<string, Map<string, string>>();
  for (const c of columns) {
    const bucket = byModel.get(c.model) ?? new Map<string, string>();
    bucket.set(c.field, c.column);
    byModel.set(c.model, bucket);
  }

  const pairs: Pair[] = [];
  for (const [model, fields] of byModel) {
    for (const [field, column] of fields) {
      for (const rule of PAIR_RULES) {
        const match = rule.start.exec(field);
        if (!match) continue;
        const endField = rule.end(match[1] ?? "");
        const endColumn = fields.get(endField);
        if (endColumn === undefined) continue;
        pairs.push({ model, startColumn: column, endColumn });
      }
    }
  }
  return pairs;
}

const PAIRS = findPairs();

/**
 * 期間の組と、それを守っている CHECK 制約の名前。
 *
 * **順序制約を持たない選択肢を用意しない。** 期間の組で「順序はどちらでもよい」は
 * 成立しないので、免除ではなく制約名だけを書く。持てない事情ができたときは、
 * この型を広げる前にその事情を疑う。
 */
const ORDER_CONSTRAINTS: Readonly<Record<string, string>> = {
  "Reservation.start_time": "reservations_time_order_check",
  "EventTimeSlot.start_at": "event_time_slots_time_order",
  "SpaceRatePlan.effective_from": "space_rate_plans_effective_range_check",
  "BlockedDate.start_date": "blocked_dates_date_order_check",
  "Coupon.valid_from": "coupons_validity_order_check",
  "AnnouncementBar.start_at": "announcement_bars_period_order_check",
  "Event.first_slot_start_at": "events_slot_span_order_check",
  "SmartLockPasscode.start_time": "smart_lock_passcodes_window_order_check",
};

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

function key(p: Pair): string {
  return `${p.model}.${p.startColumn}`;
}

describe("期間の列は順序が DB で強制されている", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // 対を 1 組も拾えていないと以降が全部 vacuous に通る。
    expect(PAIRS.length).toBeGreaterThanOrEqual(8);
    expect(CHECKS.size).toBeGreaterThan(50);
    // 既知の組を名指しで固定する（命名規則の変換が壊れたらここで落ちる）。
    expect(PAIRS.map(key)).toContain("Reservation.start_time");
    expect(PAIRS.map(key)).toContain("Coupon.valid_from");
  });

  test("すべての期間の組が順序制約を宣言している", () => {
    const undeclared = PAIRS.filter((p) => !(key(p) in ORDER_CONSTRAINTS)).map(
      (p) =>
        `${p.model}: ${p.startColumn} と ${p.endColumn} の順序を守る CHECK が宣言されていない。` +
        `逆転すると「保存できるのに一度も効かない」状態になる`,
    );

    expect(undeclared).toEqual([]);
  });

  test("宣言した制約が実在し、両方の列を参照している", () => {
    const failures = PAIRS.flatMap((p) => {
      const name = ORDER_CONSTRAINTS[key(p)];
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
