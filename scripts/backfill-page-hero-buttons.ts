/**
 * page-hero セクションの欠落 buttons を DEFAULT_PAGE_HERO.buttons で補完する一回限りスクリプト
 *
 * home hero 等の Section.config に buttons キーが欠落し CTA ボタンが非表示になる
 * データ欠損の修復。seed は既存セクションの config を更新しないため別途バックフィルが必要。
 *
 * 冪等 — buttons キーが無い editorial-split / compact / media variant の page-hero のみ対象
 * （minimal variant は buttons を持たない）。既に buttons があるものはスキップ。
 *
 * 使用方法:
 *   bun scripts/backfill-page-hero-buttons.ts            # 実移行
 *   bun scripts/backfill-page-hero-buttons.ts --dry-run  # 対象集計のみ (書込なし)
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";
import { DEFAULT_PAGE_HERO } from "@/shared/lib/sections/definitions/page-hero/defaults";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// buttons フィールドを持つ variant（minimal は持たない）
const VARIANTS_WITH_BUTTONS = new Set(["editorial-split", "compact", "media"]);

// DEFAULT_PAGE_HERO は editorial-split（buttons を持つ variant）。union narrowing で取り出す。
const DEFAULT_BUTTONS =
  DEFAULT_PAGE_HERO.variant === "editorial-split"
    ? DEFAULT_PAGE_HERO.buttons
    : [];

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: "page-hero" },
    select: { id: true, config: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const section of sections) {
    const config = section.config;
    if (!isRecord(config)) {
      skipped++;
      continue;
    }
    const variant = config["variant"];
    if (typeof variant !== "string" || !VARIANTS_WITH_BUTTONS.has(variant)) {
      skipped++;
      continue;
    }
    if ("buttons" in config) {
      skipped++;
      continue;
    }

    const nextConfig = { ...config, buttons: DEFAULT_BUTTONS };

    console.log(
      `${isDryRun ? "[dry-run] " : ""}backfill buttons → section ${section.id} (variant=${variant})`,
    );

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: nextConfig },
      });
    }
    migrated++;
  }

  console.log(
    `✅ page-hero buttons backfill done — total: ${sections.length}, migrated: ${migrated}, skipped: ${skipped}${
      isDryRun ? " (dry-run)" : ""
    }`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(
      "❌ page-hero buttons backfill failed:",
      error instanceof Error ? error.message : String(error),
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
