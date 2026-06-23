/**
 * page-hero セクションの欠落 buttons を DEFAULT_PAGE_HERO.buttons で補完する一回限りスクリプト
 *
 * home hero 等の Section.config に buttons キーが欠落し CTA ボタンが非表示になる
 * データ欠損の修復。seed は既存セクションの config を更新しないため別途バックフィルが必要。
 *
 * 冪等 — DEFAULT_PAGE_HERO のボタンを URL 単位で欠落分のみ補完（editorial-split / compact /
 * media variant が対象、minimal は buttons なし）。既存ボタンは保持し不足 URL のみ末尾追加する。
 *
 * 使用方法:
 *   bun scripts/backfill-page-hero-buttons.ts            # 実移行
 *   bun scripts/backfill-page-hero-buttons.ts --dry-run  # 対象集計のみ (書込なし)
 */

import { isRecord } from "@/shared/lib/serialize";
import { DEFAULT_PAGE_HERO } from "@/shared/lib/sections/definitions/page-hero/defaults";
import { withScript } from "./_shared/script-prisma";

const isDryRun = process.argv.slice(2).includes("--dry-run");

// buttons フィールドを持つ variant（minimal は持たない）
const VARIANTS_WITH_BUTTONS = new Set(["editorial-split", "compact", "media"]);

// DEFAULT_PAGE_HERO は editorial-split（buttons を持つ variant）。union narrowing で取り出す。
const DEFAULT_BUTTONS =
  DEFAULT_PAGE_HERO.variant === "editorial-split"
    ? DEFAULT_PAGE_HERO.buttons
    : [];

await withScript("backfill-page-hero-buttons", async (prisma) => {
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
    // 既存ボタンを保持し、DEFAULT_PAGE_HERO のうち URL が欠落しているものだけ末尾追加（冪等）
    const existing = Array.isArray(config["buttons"]) ? config["buttons"] : [];
    const existingUrls = new Set(
      existing
        .map((b) => (isRecord(b) ? b["url"] : undefined))
        .filter((u): u is string => typeof u === "string"),
    );
    const missing = DEFAULT_BUTTONS.filter((b) => !existingUrls.has(b.url));
    if (missing.length === 0) {
      skipped++;
      continue;
    }

    const nextConfig = { ...config, buttons: [...existing, ...missing] };

    console.log(
      `${isDryRun ? "[dry-run] " : ""}backfill ${missing.length} button(s) [${missing.map((b) => b.url).join(", ")}] → section ${section.id} (variant=${variant})`,
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
});
