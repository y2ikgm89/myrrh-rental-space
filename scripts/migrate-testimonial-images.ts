/**
 * Phase 2B Migration helper — testimonial.items[].authorImageUrl を authorImage に変換
 *
 * Section.config の items 配列内 authorImageUrl: string を
 * authorImage: { url, alt: "" } group に in-place で変換する。
 *
 * jsonb_path での配列要素更新は複雑かつエラー時のロールバックが難しいため、
 * application 層の bun script で安全に migration する。
 *
 * 使い方:
 *   bun scripts/migrate-testimonial-images.ts
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: "testimonial" },
  });

  console.log(`Found ${sections.length} testimonial sections`);
  let migratedCount = 0;
  let itemConvertCount = 0;

  for (const section of sections) {
    const config = section.config;
    if (
      typeof config !== "object" ||
      config === null ||
      Array.isArray(config) ||
      !("items" in config)
    ) {
      continue;
    }

    const items = (config as { items: unknown }).items;
    if (!Array.isArray(items)) continue;

    let changed = false;
    const newItems = items.map((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        Array.isArray(item) ||
        !("authorImageUrl" in item)
      ) {
        return item;
      }
      const itemRecord = item as Record<string, unknown>;
      const url =
        typeof itemRecord["authorImageUrl"] === "string"
          ? itemRecord["authorImageUrl"]
          : "";
      const { authorImageUrl: _omit, ...rest } = itemRecord;
      void _omit;
      changed = true;
      itemConvertCount++;
      return {
        ...rest,
        authorImage: { url, alt: "" },
      };
    });

    if (changed) {
      const newConfig = {
        ...(config as Record<string, unknown>),
        items: newItems,
      };
      await prisma.section.update({
        where: { id: section.id },
        data: { config: newConfig as never },
      });
      migratedCount++;
      console.log(
        `Migrated section ${section.id} (${itemConvertCount} items so far)`,
      );
    }
  }

  console.log(
    `Done. Sections migrated: ${migratedCount}, items converted: ${itemConvertCount}`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
