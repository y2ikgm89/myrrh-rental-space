/**
 * gallery セクションの Section.config.images → config.media 一回限り rename スクリプト
 *
 * gallery config を「画像のみ複数」から「画像・動画混在の複数メディア」へ clean-break
 * したことに伴う一回限りのデータ移行。後方互換マッパーは作らない方針のため、既存 DB の
 * `config.images` キーを `config.media` に rename する。既存の画像 URL 値はそのまま有効
 * （画像は valid な media）。
 *
 * 使用方法:
 *   bun scripts/migrate-gallery-images-to-media.ts            # 実移行
 *   bun scripts/migrate-gallery-images-to-media.ts --dry-run  # 対象集計のみ (書込なし)
 *
 * 冪等 — `images` キーがあり `media` キーが無い gallery section のみ rename する。
 */

import { isRecord } from "@/shared/lib/serialize";
import { withScript } from "./_shared/script-prisma";

const isDryRun = process.argv.slice(2).includes("--dry-run");

await withScript("migrate-gallery-images-to-media", async (prisma) => {
  const sections = await prisma.section.findMany({
    where: { type: "gallery" },
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
    const hasImages = "images" in config;
    const hasMedia = "media" in config;
    if (!hasImages || hasMedia) {
      skipped++;
      continue;
    }

    const { images, ...rest } = config;
    const nextConfig = { ...rest, media: images };

    console.log(`${isDryRun ? "[dry-run] " : ""}migrate section ${section.id}`);

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: nextConfig },
      });
    }
    migrated++;
  }

  console.log(
    `✅ gallery migrate done — total: ${sections.length}, migrated: ${migrated}, skipped: ${skipped}${
      isDryRun ? " (dry-run)" : ""
    }`,
  );
});
