/**
 * ホーム content セクションの過大な上下余白を是正する一回限りスクリプト
 *
 * home の content セクションは features(lg) → value-props(none) → showcase(lg) →
 * features(lg) → cta(lg) と padded セクションが連続し、各境界で pb+pt が二重計上されて
 * desktop 260px / mobile 130px の死に余白が生じていた。
 *
 * 規約「--space-lg/xl は hero/dramatic 専用」に整合させ、content セクションを md に統一 +
 * 交互リズム(padded→none→padded)を復元する:
 *   order 0 features      lg → md
 *   order 2 space-showcase lg → md
 *   order 3 features      lg → none   (showcase/cta の md と交互配置)
 *   order 4 cta           lg → md
 * これで全境界が単側 --space-md(85/48px) に揃う。
 *
 * seed は既存セクションの config を更新しないため別途バックフィルが必要
 * (DEFAULT_PAGE_SECTIONS.home の同変更は fresh seed のみに反映される)。
 *
 * 冪等 — layout.padding が旧 default "lg" のセクションのみ是正する
 * (admin が手動変更済みの値は上書きしない)。
 *
 * 使用方法:
 *   bun scripts/backfill-home-section-spacing.ts            # 実移行
 *   bun scripts/backfill-home-section-spacing.ts --dry-run  # 対象集計のみ (書込なし)
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// 旧 default "lg" のみ是正対象 (admin 手動変更を保護)
const OLD_PADDING = "lg";

// order → { type, 新 padding }
const TARGETS: ReadonlyArray<{
  order: number;
  type: string;
  padding: string;
}> = [
  { order: 0, type: "features", padding: "md" },
  { order: 2, type: "space-showcase", padding: "md" },
  { order: 3, type: "features", padding: "none" },
  { order: 4, type: "cta", padding: "md" },
];

async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: "home" },
    select: { id: true },
  });
  if (!page) {
    console.log("⚠️ home ページが見つかりません — スキップ");
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const target of TARGETS) {
    const section = await prisma.section.findFirst({
      where: { pageId: page.id, order: target.order, type: target.type },
      select: { id: true, config: true },
    });
    if (!section || !isRecord(section.config)) {
      console.log(
        `⏭️  order=${target.order} (${target.type}) が見つからない/不正 — スキップ`,
      );
      skipped++;
      continue;
    }
    const config = section.config;
    const layout = isRecord(config["layout"]) ? config["layout"] : {};
    const current = layout["padding"];

    if (current !== OLD_PADDING) {
      console.log(
        `⏭️  order=${target.order} (${target.type}) は padding="${current ?? "(none)"}" のためスキップ`,
      );
      skipped++;
      continue;
    }

    console.log(
      `${isDryRun ? "[dry-run] " : ""}order=${target.order} (${target.type}) padding "${OLD_PADDING}" → "${target.padding}" (section ${section.id})`,
    );

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: {
          config: {
            ...config,
            layout: { ...layout, padding: target.padding },
          },
        },
      });
    }
    migrated++;
  }

  console.log(
    `✅ home section spacing backfill done — migrated: ${migrated}, skipped: ${skipped}${
      isDryRun ? " (dry-run)" : ""
    }`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(
      "❌ home section spacing backfill failed:",
      error instanceof Error ? error.message : String(error),
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
