import type { AppPrismaClient } from "@/shared/db/create-app-prisma-client";
import { SYSTEM_PAGES } from "@/shared/lib/validations/page";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import { logError } from "@/shared/lib/errors/logger-core";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/types";
import { resolveTemplateForSlug } from "@/shared/lib/sections/page-templates";

/**
 * システムページ用コマンド（引数で PrismaClient を受け取る）
 * seed / Next とも `createAppPrismaClient` 済みの同一型（`AppPrismaClient`）を渡す。
 */

export async function ensurePageSectionsCommand(
  db: AppPrismaClient,
  pageId: string,
  slug: string,
): Promise<number> {
  const defaults = DEFAULT_PAGE_SECTIONS[slug];
  if (!defaults || defaults.length === 0) {
    return 0;
  }

  const existingSections = await db.section.findMany({
    where: { pageId },
    select: { type: true },
  });
  const existingTypes = new Set(
    existingSections.map((section) => section.type),
  );
  const missingSections = defaults.filter(
    (section) => !existingTypes.has(section.type),
  );

  if (missingSections.length === 0) {
    return 0;
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const currentSections = await tx.section.findMany({
          where: { pageId },
          select: { type: true },
        });
        const currentTypes = new Set(
          currentSections.map((section) => section.type),
        );
        const toCreate = defaults.filter(
          (section) => !currentTypes.has(section.type),
        );

        if (toCreate.length === 0) {
          return 0;
        }

        const created = await tx.section.createMany({
          data: toCreate.map((section) => ({
            pageId,
            type: section.type,
            config: section.config,
            order: section.order,
            isActive: section.isActive,
          })),
        });

        return created.count;
      },
      { isolationLevel: "Serializable" },
    );
  } catch {
    return 0;
  }
}

export async function bootstrapSystemPagesCommand(
  db: AppPrismaClient,
): Promise<void> {
  for (const definition of SYSTEM_PAGES) {
    try {
      const existingPage = await db.page.findUnique({
        where: { slug: definition.slug },
        select: { id: true, isSystemPage: true },
      });

      if (existingPage) {
        if (!existingPage.isSystemPage) {
          await db.page.update({
            where: { id: existingPage.id },
            data: { isSystemPage: true },
          });
        }

        await ensurePageSectionsCommand(db, existingPage.id, definition.slug);
        continue;
      }

      const page = await db.page.create({
        data: {
          slug: definition.slug,
          title: definition.title,
          template: resolveTemplateForSlug(definition.slug),
          isPublished: true,
          isActive: true,
          isSystemPage: true,
        },
      });

      await ensurePageSectionsCommand(db, page.id, definition.slug);
    } catch (error) {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "bootstrapSystemPages", slug: definition.slug },
      });
    }
  }
}
