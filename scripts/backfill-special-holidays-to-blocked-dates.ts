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
 * ## 流す順序（守ること）
 *
 *   1. このスクリプトを `--apply` で流す
 *   2. **その直後に** contract デプロイ（列の DROP）を実行する
 *
 * この順序には理由がある。**このスクリプトは Next.js の Data Cache を無効化できない。**
 * `invalidateSiteWideCache` は `updateTag` を使っており Server Action 専用で、
 * 単体プロセスから呼ぶと throw する（`src/shared/lib/cache/site-wide.ts`）。
 * 管理画面から休業日を登録する経路はこれを通るが、ここは通れない。
 *
 * 直後にデプロイすれば Cloud Run のインスタンスが入れ替わり Data Cache は空になるので、
 * 移した休業日は次のリクエストから JSON-LD に載る。**逆順（デプロイ → backfill）や、
 * デプロイを伴わない単独実行では、移した休業日が公開ページに出るまで
 * `cacheLife` の期限切れを待つことになる。**
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
import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";

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

/** `YYYY-MM-DD` の**形**。暦としての妥当性は下の round-trip で見る。 */
const DATE_ONLY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * `YYYY-MM-DD` を UTC 深夜の Date にする。暦として存在しない日付は null。
 *
 * **形だけの検査では足りない。** `new Date("2026-02-30T00:00:00.000Z")` は
 * 例外を投げず 3 月 2 日に正規化するので、形の検査だけ通すと
 * **違う日を休業日にして**しまう（しかも誰も気づけない）。`2026-13-01` は
 * Invalid Date になり、そのまま Prisma へ渡せばループの途中で落ちて
 * 「一部だけ入った」状態になる。
 *
 * 作った Date を `YYYY-MM-DD` に戻して入力と一致するかで両方を弾く。
 */
export function parseCalendarDate(value: string): Date | null {
  if (!DATE_ONLY_SHAPE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? date : null;
}

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
      if (typeof entry !== "string" || parseCalendarDate(entry) === null) {
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

  // `acquireBlockedDateWriteLocks` は `src/shared/domain` にあり `server-only` を
  // import する（bun では常に throw する実装）。e2e fixture script と同じく
  // no-op へ差し替えてから **動的** import する — 静的 import は巻き上げられて
  // このプラグイン登録より先に評価されてしまう。
  //
  // lock の内容をここへ書き写さない。「LOCATION スコープは配下の全 Space を
  // id 昇順で lock する」は予約書込との直列化契約そのもので、写した瞬間に
  // 本体と食い違いうる 2 つ目の定義になる。
  Bun.plugin({
    name: "stub-server-only",
    setup(build) {
      build.module("server-only", () => ({ exports: {}, loader: "object" }));
    },
  });
  const { acquireBlockedDateWriteLocks } =
    await import("@/shared/domain/blocked-dates/locks");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
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
      const date = parseCalendarDate(row.date);
      if (date === null) continue; // planBackfill を通っているのでここには来ない

      const outcome = await prisma.$transaction(async (tx) => {
        // 書くときだけ lock を取る（dry-run は読むだけなので本番の予約書込を待たせない）。
        // 存在確認も lock の内側に置く — 外に出すと、同時に 2 回流したときに
        // 両方が「無い」と判断して二重に作りうる。
        if (apply) {
          await acquireBlockedDateWriteLocks(tx, {
            scope: BLOCKED_DATE_SCOPE.LOCATION,
            locationId: row.locationId,
            spaceId: null,
          });
        }

        const already = await tx.blockedDate.findFirst({
          where: {
            scope: BLOCKED_DATE_SCOPE.LOCATION,
            locationId: row.locationId,
            startDate: date,
            endDate: date,
          },
          select: { id: true },
        });
        if (already) return "existed" as const;

        if (apply) {
          await tx.blockedDate.create({
            data: {
              scope: BLOCKED_DATE_SCOPE.LOCATION,
              locationId: row.locationId,
              startDate: date,
              endDate: date,
              type: "HOLIDAY",
              reason: "特別休業日",
              createdBy: actorId,
            },
          });
        }
        return "created" as const;
      });

      if (outcome === "existed") {
        existed += 1;
        continue;
      }
      console.info(
        `[backfill] ${apply ? "作成" : "作成予定"} ${row.slug} ${row.date}`,
      );
      created += 1;
    }

    console.info(
      `[backfill] ${apply ? "作成" : "作成予定"} ${created} 件 / 既存 ${existed} 件` +
        (apply ? "" : "（--apply を付けると実際に入れる）"),
    );
    if (apply && created > 0) {
      console.info(
        "[backfill] このスクリプトは Next.js の Data Cache を無効化できない。" +
          "続けて contract デプロイを実行すること（インスタンスが入れ替わり Data Cache が空になる）。",
      );
    }
    return skipped.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
