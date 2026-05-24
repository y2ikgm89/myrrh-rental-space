/**
 * System Page Sections Seeder
 *
 * `DEFAULT_PAGE_SECTIONS` から home + 7 system pages のセクション群を作成する。
 * 既存セクションがあるページは skip (管理画面での編集を破壊しない)。
 *
 * `home.page-hero` は `seedPages` で別経路挿入されるため本 seeder の対象外。
 */

import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import type { AppPrismaClient } from "../client";
import { log } from "../lib/log";

const SYSTEM_PAGE_SLUGS = [
  "home",
  "about",
  "contact",
  "faq",
  "news",
  "posts",
  "reservation",
  "spaces",
] as const;

export async function seedSystemPageSections(
  prisma: AppPrismaClient,
): Promise<void> {
  let createdPages = 0;

  for (const slug of SYSTEM_PAGE_SLUGS) {
    const page = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!page) continue;

    // home は page-hero (order=-1) が seedPages で挿入済なので、それを除いた
    // "通常 sections" がゼロかどうかで判定する (再 seed でも管理画面編集を保持)。
    const nonHeroCount = await prisma.section.count({
      where: { pageId: page.id, NOT: { type: "page-hero" } },
    });
    if (nonHeroCount > 0) continue;

    const defaults = DEFAULT_PAGE_SECTIONS[slug];
    if (!defaults || defaults.length === 0) continue;

    for (const section of defaults) {
      await prisma.section.create({
        data: {
          pageId: page.id,
          type: section.type,
          config: section.config,
          order: section.order,
          isActive: section.isActive,
        },
      });
    }
    createdPages++;
  }

  log.done("pages seeded with sections", createdPages);
}
