import "server-only";

import { prisma } from "@/shared/db/prisma";
import { SYSTEM_PAGES } from "@/shared/lib/validations/page";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import {
  defaultHomepageSectionOrder,
  defaultSectionConfigs,
} from "@/shared/lib/validations/section";
import { logError } from "@/shared/lib/errors/logger";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/types";

export async function ensurePageSectionsCommand(
  pageId: string,
  slug: string,
): Promise<number> {
  const defaults = DEFAULT_PAGE_SECTIONS[slug];
  if (!defaults || defaults.length === 0) {
    return 0;
  }

  const existingSections = await prisma.section.findMany({
    where: { pageId },
    select: { type: true },
  });
  const existingTypes = new Set(existingSections.map((section) => section.type));
  const missingSections = defaults.filter(
    (section) => !existingTypes.has(section.type),
  );

  if (missingSections.length === 0) {
    return 0;
  }

  try {
    return await prisma.$transaction(
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
            title: section.title,
            config: section.config,
            design: section.design ?? {},
            contentHtml: section.content,
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

export async function ensureHomepageSectionsCommand(): Promise<number> {
  const existingCount = await prisma.section.count({
    where: { pageId: null },
  });
  if (existingCount > 0) {
    return 0;
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const count = await tx.section.count({
          where: { pageId: null },
        });
        if (count > 0) {
          return 0;
        }

        const created = await tx.section.createMany({
          data: defaultHomepageSectionOrder.map((type, index) => ({
            pageId: undefined,
            type,
            config: defaultSectionConfigs[type],
            design: {},
            order: index,
            isActive: true,
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

export async function bootstrapSystemPagesCommand(): Promise<void> {
  try {
    await ensureHomepageSectionsCommand();
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "bootstrapSystemPages", slug: "home" },
    });
  }

  for (const definition of SYSTEM_PAGES) {
    if (definition.slug === "home") {
      continue;
    }

    try {
      const existingPage = await prisma.page.findUnique({
        where: { slug: definition.slug },
        select: { id: true, isSystemPage: true },
      });

      if (existingPage) {
        if (!existingPage.isSystemPage) {
          await prisma.page.update({
            where: { id: existingPage.id },
            data: { isSystemPage: true },
          });
        }

        await ensurePageSectionsCommand(existingPage.id, definition.slug);
        continue;
      }

      const page = await prisma.page.create({
        data: {
          slug: definition.slug,
          title: definition.title,
          description: definition.description,
          isPublished: true,
          isActive: true,
          isSystemPage: true,
        },
      });

      await ensurePageSectionsCommand(page.id, definition.slug);
    } catch (error) {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "bootstrapSystemPages", slug: definition.slug },
      });
    }
  }
}
