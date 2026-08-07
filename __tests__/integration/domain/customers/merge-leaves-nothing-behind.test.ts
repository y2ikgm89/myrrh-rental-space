/**
 * 顧客を統合したとき、source に紐づいていた行が**黙って消えていない**ことを
 * 実 DB で確かめる。
 *
 * ## 何が起きうるのか
 *
 * `mergeCustomerCommand` は最後に `tx.customer.delete()` で source を物理削除する。
 * `Customer` を参照する FK のうち `onDelete: Cascade` のものは、そこで**行ごと
 * 消える**。だから削除の前に付け替えていない子は、統合した瞬間に失われる。
 *
 * 実装は 7 つの関係を明示的に付け替えているが、`PendingCustomerEmailChange` と
 * `PendingCustomerMerge` は触れておらず、cascade に任せて消えている。消えること
 * 自体は正しい —— 存在しなくなる顧客のメール変更申請を target へ持ち越したら
 * **target が申請していないアドレスへの変更**を有効にしてしまうし、実行し終えた
 * 統合申請は用済みになる。問題は、その判断が**どこにも宣言されていなかった**こと。
 * 次に `Customer` へ子が増えたとき、同じように黙って消えても誰も気づけない。
 *
 * ## 一覧を手で書くと、書いた本人が取り落とす
 *
 * この検査を書くとき、schema.prisma を自前で parse して「CASCADE 子は 4 つ」と
 * 数えた。実際は 5 つで、`pending_customer_merges`（source / target の **2 列**で
 * `customers` を参照する）を落としていた。DB から採る側がそれを検出して落ちた。
 * 母集合を転記しない理由がそのまま出た形なので、記録として残す。
 *
 * ## 一覧を書かず、DB から母集合を採る
 *
 * 消えうる表の一覧を手で書くと、その一覧が drift する
 * （`anonymize-covers-pii.test.ts` と同じ理由）。ここでは `pg_constraint` から
 * **`customers` を CASCADE で参照している表**を引く。新しい子が増えたら
 * 「fixture が覆っていない」と言って落ちる。
 *
 * ## 各表について「移った」か「消えると決めた」かを固定する
 *
 * 観測した振る舞いと `DISPOSITIONS` の宣言が一致することを見る。移るはずの表が
 * 消えるようになったら落ちるし、消えると決めた表が黙って増えても落ちる。
 *
 * **この検査が証明しないこと**: 消えると決めた判断がプロダクトとして正しいこと。
 * そこは人が決める。ここが保証するのは「決めていないものが消えていない」だけ。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { mergeCustomerCommand } =
  await import("@/shared/domain/customers/customer-lifecycle-commands");

/** 統合で source の行がどうなるか。 */
type Disposition = "moved" | "dropped";

/**
 * 物理テーブル名 → 期待する扱い。
 *
 * `moved`: target へ付け替わる（顧客の履歴は統合先に残る）。
 * `dropped`: 消える。**消してよい理由がある場合だけ**ここに置く。
 */
const DISPOSITIONS: Readonly<Record<string, Disposition>> = {
  reservations: "moved",
  reservation_series: "moved",
  space_reviews: "moved",
  // 存在しなくなる顧客のメール変更申請。target へ持ち越すと、target が申請して
  // いないアドレスへの変更を有効にしてしまう（なりすましの経路になる）。
  pending_customer_email_changes: "dropped",
  // 統合そのものの申請。実行し終えた時点で用済みで、source を指す申請も
  // source を統合先とする申請も宙に浮く。**この表は customers を 2 列
  // （source / target）で参照する** — 片方だけ見ると母集合を取り落とす。
  pending_customer_merges: "dropped",
};

/** 1 つの表が `customers` を複数列で参照しうる（`pending_customer_merges`）。 */
interface CascadeChild {
  readonly table: string;
  readonly columns: readonly string[];
}

/** `customers.id` を CASCADE で参照している表（＝ source 削除で消える表）。 */
async function cascadeChildren(): Promise<CascadeChild[]> {
  const rows = await prisma.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT child.relname AS table_name, att.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      JOIN unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute att
        ON att.attrelid = child.oid AND att.attnum = k.attnum
     WHERE c.contype = 'f'
       AND parent.relname = 'customers'
       AND c.confdeltype = 'c'
       AND n.nspname = 'public'
     ORDER BY 1`;
  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    const columns = byTable.get(row.table_name) ?? [];
    columns.push(row.column_name);
    byTable.set(row.table_name, columns);
  }
  return [...byTable].map(([table, columns]) => ({ table, columns }));
}

const unique = (): string => crypto.randomUUID();

const created: {
  locationId?: string;
  spaceId?: string;
  sourceId?: string;
  targetId?: string;
} = {};

let children: CascadeChild[] = [];

beforeAll(async () => {
  children = await cascadeChildren();

  const location = await prisma.location.create({
    data: {
      name: `merge-loc-${unique()}`,
      slug: `merge-loc-${unique()}`,
      address: "東京都渋谷区1-1-1",
      imageUrl: "/images/seed/location-main.svg",
      accessLines: [],
      imageUrls: [],
      isActive: false,
    },
    select: { id: true },
  });
  created.locationId = location.id;

  const space = await prisma.space.create({
    data: {
      name: `merge-space-${unique()}`,
      slug: `merge-space-${unique()}`,
      descriptionJson: {},
      descriptionHtml: "<p>統合テスト用</p>",
      descriptionPlainText: "統合テスト用",
      mainImageUrl: "/images/seed/space-main.svg",
      hourlyPrice: 1000,
      capacity: 4,
      locationId: location.id,
      isActive: false,
    },
    select: { id: true },
  });
  created.spaceId = space.id;

  const makeCustomer = async (label: string): Promise<string> => {
    const email = `merge-${label}-${unique()}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        lastName: "統合",
        firstName: label,
        email,
        emailCanonical: email,
      },
      select: { id: true },
    });
    return customer.id;
  };
  created.sourceId = await makeCustomer("source");
  created.targetId = await makeCustomer("target");

  // 各 CASCADE 子に source の行を 1 件ずつ置く。
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: created.sourceId,
      startTime: new Date("2026-09-01T01:00:00Z"),
      endTime: new Date("2026-09-01T03:00:00Z"),
      basePrice: 2000,
      totalPrice: 2000,
      rateBreakdownJson: {},
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 200,
      totalPriceWithTax: 2200,
    },
    select: { id: true },
  });

  await prisma.reservationSeries.create({
    data: {
      spaceId: space.id,
      customerId: created.sourceId,
      rrule: "FREQ=WEEKLY;COUNT=1",
      dtstart: new Date("2026-09-01T01:00:00Z"),
      duration: 120,
      instanceCount: 1,
      templateData: {},
      agreementSnapshot: [],
    },
  });

  await prisma.spaceReview.create({
    data: {
      spaceId: space.id,
      customerId: created.sourceId,
      reservationId: reservation.id,
      rating: 5,
    },
  });

  await prisma.pendingCustomerMerge.create({
    data: {
      sourceCustomerId: created.sourceId,
      targetCustomerId: created.targetId,
      guestEmail: `merge-req-${unique()}@example.com`,
      tokenHash: unique().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const newEmail = `merge-pending-${unique()}@example.com`;
  await prisma.pendingCustomerEmailChange.create({
    data: {
      customerId: created.sourceId,
      newEmail,
      newEmailCanonical: newEmail,
      tokenHash: unique().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  // source は merge で消えている。target 側に付け替わった行は target ごと消す。
  for (const id of [created.targetId, created.sourceId]) {
    if (id !== undefined) {
      await prisma.customer.deleteMany({ where: { id } });
    }
  }
  if (created.spaceId !== undefined) {
    await prisma.space.deleteMany({ where: { id: created.spaceId } });
  }
  if (created.locationId !== undefined) {
    await prisma.location.deleteMany({ where: { id: created.locationId } });
  }
  await prisma.$disconnect();
});

/** その表で、指定 customer を参照している行数。 */
async function countFor(
  child: CascadeChild,
  customerId: string,
): Promise<number> {
  const predicate = child.columns
    .map((column) => `"${column}" = $1`)
    .join(" OR ");
  const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM "${child.table}" WHERE ${predicate}`,
    customerId,
  );
  return Number(row?.n ?? 0);
}

describe("顧客の統合は、決めていないものを消さない", () => {
  test("fixture が CASCADE 子を全部覆っている（母集合の自己検査）", () => {
    // 一覧を手で書かず DB から採る。新しい子が増えたらここで気づける。
    expect(children.length).toBeGreaterThan(0);

    const covered = new Set(Object.keys(DISPOSITIONS));
    const uncovered = children
      .map((child) => child.table)
      .filter((table) => !covered.has(table))
      .map(
        (table) =>
          `${table}: customers を CASCADE で参照しているのに、統合時の扱いが宣言されていない。` +
          `付け替えるなら mergeCustomerCommand に足し、消してよいなら理由つきで DISPOSITIONS に置く`,
      );
    expect(uncovered).toEqual([]);

    const stale = [...covered]
      .filter((table) => !children.some((child) => child.table === table))
      .map((table) => `${table}: もう CASCADE 子ではない。宣言を外すこと`);
    expect(stale).toEqual([]);
  });

  test("統合前は、全部の子に source の行がある（検査が空振りしていない）", async () => {
    const missing: string[] = [];
    for (const child of children) {
      const n = await countFor(child, created.sourceId ?? "");
      if (n === 0) missing.push(`${child.table}: source の行が無い`);
    }
    expect(missing).toEqual([]);
  });

  test("統合すると、宣言どおりに移るか消えるかする", async () => {
    const before = new Map<string, number>();
    for (const child of children) {
      before.set(child.table, await countFor(child, created.targetId ?? ""));
    }

    await mergeCustomerCommand(created.sourceId ?? "", created.targetId ?? "");

    const observed: Record<string, Disposition> = {};
    for (const child of children) {
      const onTarget = await countFor(child, created.targetId ?? "");
      const gained = onTarget - (before.get(child.table) ?? 0);
      observed[child.table] = gained > 0 ? "moved" : "dropped";
    }

    // 宣言と観測が一致すること。移るはずが消えるようになったらここで落ちる。
    expect(observed).toEqual(
      Object.fromEntries(
        children.map((child) => [
          child.table,
          DISPOSITIONS[child.table] ?? "moved",
        ]),
      ),
    );
  });

  test("source を参照する行はどこにも残らない", async () => {
    // 物理削除された顧客への参照が残っていたら、それは FK が CASCADE でない
    // （＝この検査の母集合から漏れている）ということ。
    const leftovers: string[] = [];
    for (const child of children) {
      const n = await countFor(child, created.sourceId ?? "");
      if (n > 0)
        leftovers.push(`${child.table}: ${n} 行が source を指したまま`);
    }
    expect(leftovers).toEqual([]);
  });
});
