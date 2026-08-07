/**
 * `locations.special_holidays` に残っている日付を BlockedDate（scope=LOCATION）へ移す。
 *
 * ## なぜ要るのか
 *
 * 「特別休業日」は JSON-LD にしか使われておらず、予約可否には効いていなかった。
 * その読み取りを BlockedDate へ寄せた時点で、**列に残っている日付は誰にも読まれなく
 * なる**。同じ変更で管理画面のカードも消したので、UI からは中身を見ることすらできない。
 * 列を DROP する前に、ここで BlockedDate へ移しておく。
 *
 * **一回限りのスクリプト。** 列を DROP する PR で削除する
 * （`one-time-backfill-clean-break.test.ts` が過去の同種スクリプトの残存を禁じている）。
 *
 * ## 使い方
 *
 * ```sh
 * # 何が起きるかだけ見る（既定。書き込まない）
 * bun scripts/backfill-special-holidays-to-blocked-dates.ts --url "postgresql://..." --actor <userId>
 *
 * # 実際に入れる
 * bun scripts/backfill-special-holidays-to-blocked-dates.ts --url "postgresql://..." --actor <userId> --apply
 * ```
 *
 * `--actor` は `BlockedDate.createdBy`（User への NOT NULL FK）に入れる値。
 * **推測しない** — 誰が入れた休業日かは証跡なので、実行者が明示する。
 *
 * 冪等: 同じ拠点・同じ単日の BlockedDate が既にあれば飛ばす。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

/** `special_holidays` に入っている 1 拠点ぶんの生の値。 */
export interface RawLocationHolidays {
  readonly id: string;
  readonly slug: string;
  readonly specialHolidays: unknown;
}

export interface PlannedRow {
  readonly locationId: string;
  readonly slug: string;
  /** `YYYY-MM-DD`。単日休業なので startDate = endDate。 */
  readonly date: string;
}

/** `YYYY-MM-DD` だけを受ける。書式検証が無い列なので、ここで弾く。 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * 生の JSON 値から、作るべき行を組み立てる。
 *
 * **読めない値は黙って捨てない。** 捨てると「0 件だったので何もしなかった」と
 * 区別が付かなくなる。呼び出し側が報告できるよう `skipped` に理由付きで返す。
 */
export function planBackfill(locations: readonly RawLocationHolidays[]): {
  readonly rows: PlannedRow[];
  readonly skipped: { readonly slug: string; readonly value: string }[];
} {
  const rows: PlannedRow[] = [];
  const skipped: { slug: string; value: string }[] = [];

  for (const location of locations) {
    const raw = location.specialHolidays;
    if (raw === null || raw === undefined) continue;
    if (!Array.isArray(raw)) {
      skipped.push({ slug: location.slug, value: JSON.stringify(raw) });
      continue;
    }
    for (const entry of raw) {
      if (typeof entry !== "string" || !DATE_ONLY.test(entry)) {
        skipped.push({ slug: location.slug, value: JSON.stringify(entry) });
        continue;
      }
      rows.push({ locationId: location.id, slug: location.slug, date: entry });
    }
  }

  return { rows, skipped };
}

function arg(argv: readonly string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at === -1 ? null : (argv[at + 1] ?? null);
}

export async function run(argv: readonly string[]): Promise<number> {
  const url =
    arg(argv, "--url") ??
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL"] ??
    null;
  const actorId = arg(argv, "--actor");
  const apply = argv.includes("--apply");

  if (!url) {
    console.error(
      "[backfill] --url / DIRECT_URL / DATABASE_URL のいずれかが要る",
    );
    return 2;
  }
  if (!actorId) {
    console.error(
      "[backfill] --actor <userId> が要る（BlockedDate.createdBy は証跡なので推測しない）",
    );
    return 2;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    // **列がまだあることを先に確かめる。**
    //
    // このスクリプトは「列を DROP する migration の適用前」にしか意味が無い。
    // 適用後に流すと `SELECT special_holidays` が Prisma の P2010 として
    // 生のスタックごと出るだけで、「順番を間違えた」ことが読み取れない。
    // 一度きりの本番作業なので、間違いは読める形で止める。
    const [columnPresence] = await prisma.$queryRaw<{ present: bigint }[]>`
      SELECT count(*) AS present
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'locations'
        AND column_name = 'special_holidays'
    `;
    if (Number(columnPresence?.present ?? 0) === 0) {
      console.error(
        "[backfill] locations.special_holidays がこの DB に存在しない。",
      );
      console.error(
        "[backfill] 列を DROP する migration が既に適用されている。" +
          "このスクリプトは適用**前**にしか使えない（移し損ねた値は復元できない）。",
      );
      return 1;
    }

    // 列は schema.prisma から外してあるので raw で読む。
    // エイリアスも snake_case のままにする。camelCase の引用識別子を生 SQL に
    // 書くと `raw-sql-column-names` gate が落ちる（出力名か列参照かを静的に
    // 区別できないため。gate を緩めるより TS 側で受け直す）。
    const rows = await prisma.$queryRaw<
      { id: string; slug: string; special_holidays: unknown }[]
    >`
      SELECT id::text AS id, slug, special_holidays
      FROM locations
      WHERE special_holidays IS NOT NULL
        AND jsonb_typeof(special_holidays) = 'array'
        AND jsonb_array_length(special_holidays) > 0
      ORDER BY slug
    `;

    const locations: RawLocationHolidays[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      specialHolidays: row.special_holidays,
    }));

    const { rows: planned, skipped } = planBackfill(locations);

    for (const entry of skipped) {
      console.warn(
        `[backfill] 読めない値を飛ばした ${entry.slug}: ${entry.value}`,
      );
    }

    if (planned.length === 0) {
      console.info("[backfill] 移す日付は 1 件も無い");
      return skipped.length > 0 ? 1 : 0;
    }

    let created = 0;
    let existed = 0;
    for (const row of planned) {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      const already = await prisma.blockedDate.findFirst({
        where: {
          scope: "LOCATION",
          locationId: row.locationId,
          startDate: date,
          endDate: date,
        },
        select: { id: true },
      });
      if (already) {
        existed += 1;
        continue;
      }
      console.info(
        `[backfill] ${apply ? "作成" : "作成予定"} ${row.slug} ${row.date}`,
      );
      if (apply) {
        await prisma.blockedDate.create({
          data: {
            scope: "LOCATION",
            locationId: row.locationId,
            startDate: date,
            endDate: date,
            type: "HOLIDAY",
            reason: "特別休業日",
            createdBy: actorId,
          },
        });
      }
      created += 1;
    }

    console.info(
      `[backfill] ${apply ? "作成" : "作成予定"} ${created} 件 / 既存 ${existed} 件` +
        (apply ? "" : "（--apply を付けると実際に入れる）"),
    );
    return skipped.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
