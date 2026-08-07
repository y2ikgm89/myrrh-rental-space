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
 * ## 件数の増減ではなく、置いた行そのものを追う
 *
 * 最初は「target を指す行が増えたか」で移動を判定していた。それでは
 * `pending_customer_merges` を判定できない —— 置いた行は最初から
 * `targetCustomerId` で target を指しているので、**削除されても、削除されずに
 * `sourceCustomerId` だけ付け替わっても、target を指す行数は変わらない**
 * （レビュー指摘）。宣言が `dropped` のまま実装が「消さずに残す」へ変わっても
 * 緑になる、つまり検査になっていなかった。
 *
 * だから置いた行の主キーを控え、**その行が残っているか / どの顧客を指しているか**
 * を直接見る。`moved` なら残っていて target を指す。`dropped` なら消えている。
 *
 * ## この検査が証明しないこと
 *
 * 消えると決めた判断がプロダクトとして正しいこと。そこは人が決める。ここが
 * 保証するのは「決めていないものが消えていない」だけ。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * 既定値を注入する）。**未設定なら `DATABASE_URL` へフォールバックしない** —
 * この検査は後片付けで顧客・スペース・拠点を削除するので、開発 DB に向いたまま
 * 走ると実データを壊す。CI は必ず設定するため、skip が失敗を隠す経路にはならない。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type LifecycleModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");

let prisma: PrismaModule["prisma"];
let mergeCustomerCommand: LifecycleModule["mergeCustomerCommand"];

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

interface CascadeChild {
  readonly table: string;
  /** 1 つの表が `customers` を複数列で参照しうる（`pending_customer_merges`）。 */
  readonly columns: readonly string[];
}

const unique = (): string => crypto.randomUUID();

const created: {
  locationId?: string;
  spaceId?: string;
  sourceId?: string;
  targetId?: string;
} = {};

let children: CascadeChild[] = [];
/** 物理テーブル名 → この検査が置いた行の主キー。 */
const seeded = new Map<string, string>();

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

/**
 * 置いた行の現在の姿。消えていれば `null`、残っていれば各参照列の値。
 *
 * 主キーで引くので、「消えた」と「残ったまま参照だけ変わった」を取り違えない。
 */
async function seededRow(
  child: CascadeChild,
): Promise<Record<string, string | null> | null> {
  const id = seeded.get(child.table);
  if (id === undefined) return null;
  const columns = child.columns.map((column) => `"${column}"`).join(", ");
  const rows = await prisma.$queryRawUnsafe<Record<string, string | null>[]>(
    `SELECT ${columns} FROM "${child.table}" WHERE "id" = $1`,
    id,
  );
  return rows[0] ?? null;
}

describeMaybe("顧客の統合は、決めていないものを消さない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ mergeCustomerCommand } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));

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

    // 各 CASCADE 子に source の行を 1 件ずつ置き、主キーを控える。
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
    seeded.set("reservations", reservation.id);

    const series = await prisma.reservationSeries.create({
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
      select: { id: true },
    });
    seeded.set("reservation_series", series.id);

    const review = await prisma.spaceReview.create({
      data: {
        spaceId: space.id,
        customerId: created.sourceId,
        reservationId: reservation.id,
        rating: 5,
      },
      select: { id: true },
    });
    seeded.set("space_reviews", review.id);

    const pendingMerge = await prisma.pendingCustomerMerge.create({
      data: {
        sourceCustomerId: created.sourceId,
        targetCustomerId: created.targetId,
        guestEmail: `merge-req-${unique()}@example.com`,
        tokenHash: unique().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    seeded.set("pending_customer_merges", pendingMerge.id);

    const newEmail = `merge-pending-${unique()}@example.com`;
    const pendingEmail = await prisma.pendingCustomerEmailChange.create({
      data: {
        customerId: created.sourceId,
        newEmail,
        newEmailCanonical: newEmail,
        tokenHash: unique().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    seeded.set("pending_customer_email_changes", pendingEmail.id);
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

  test("fixture が CASCADE 子を全部覆っている（母集合の自己検査）", () => {
    // 一覧を手で書かず DB から採る。新しい子が増えたらここで気づける。
    expect(children.length).toBeGreaterThan(0);

    const declared = new Set(Object.keys(DISPOSITIONS));
    const undeclared = children
      .map((child) => child.table)
      .filter((table) => !declared.has(table))
      .map(
        (table) =>
          `${table}: customers を CASCADE で参照しているのに、統合時の扱いが宣言されていない。` +
          `付け替えるなら mergeCustomerCommand に足し、消してよいなら理由つきで DISPOSITIONS に置く`,
      );
    expect(undeclared).toEqual([]);

    const stale = [...declared]
      .filter((table) => !children.some((child) => child.table === table))
      .map((table) => `${table}: もう CASCADE 子ではない。宣言を外すこと`);
    expect(stale).toEqual([]);

    // 宣言だけあって行を置いていないと、下の検査が空振りする。
    const unseeded = children
      .map((child) => child.table)
      .filter((table) => !seeded.has(table))
      .map((table) => `${table}: fixture が行を置いていない`);
    expect(unseeded).toEqual([]);
  });

  test("統合前は、置いた行がすべて source を指している（検査が空振りしていない）", async () => {
    const wrong: string[] = [];
    for (const child of children) {
      const row = await seededRow(child);
      if (row === null) {
        wrong.push(`${child.table}: 置いた行が見つからない`);
        continue;
      }
      if (!Object.values(row).includes(created.sourceId ?? "")) {
        wrong.push(`${child.table}: 置いた行が source を指していない`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("統合すると、宣言どおりに移るか消えるかする", async () => {
    await mergeCustomerCommand(created.sourceId ?? "", created.targetId ?? "");

    const observed: Record<string, Disposition> = {};
    const anomalies: string[] = [];
    for (const child of children) {
      const row = await seededRow(child);
      if (row === null) {
        // 主キーで引いて無い＝本当に消えた。件数では区別できない状態。
        observed[child.table] = "dropped";
        continue;
      }
      observed[child.table] = "moved";
      if (!Object.values(row).includes(created.targetId ?? "")) {
        anomalies.push(
          `${child.table}: 行は残っているが target を指していない（${JSON.stringify(row)}）`,
        );
      }
    }

    // 残った行は target を指していること（宙に浮いた行を moved と数えない）。
    expect(anomalies).toEqual([]);

    // 宣言と観測が一致すること。移るはずが消えるようになったらここで落ちるし、
    // 消えると決めた表が消えなくなってもここで落ちる。
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
      const predicate = child.columns
        .map((column) => `"${column}" = $1`)
        .join(" OR ");
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM "${child.table}" WHERE ${predicate}`,
        created.sourceId ?? "",
      );
      const n = Number(row?.n ?? 0);
      if (n > 0)
        leftovers.push(`${child.table}: ${n} 行が source を指したまま`);
    }
    expect(leftovers).toEqual([]);
  });
});
