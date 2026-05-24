import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { toPlainObject } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import { ensurePageSections } from "@/shared/lib/section-defaults";
import {
  getSystemPageDefinition,
  isSystemPageSlug,
  type CreatePageInput,
  type UpdatePageSeoInput,
} from "@/shared/lib/validations/page";
import { createDefaultCustomPageSections } from "@/shared/lib/constants/default-page-sections";
import { resolveTemplateForSlug } from "@/shared/lib/sections/page-templates";

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

async function ensurePageExists(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      isActive: true,
      isPublished: true,
      publishedAt: true,
    },
  });

  if (!page) {
    throw new DomainError("ページが見つかりません", "NOT_FOUND");
  }

  return page;
}

async function ensurePageSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "page",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

export async function createPageIfNotExistsCommand(
  slug: string,
  title: string,
) {
  const existingPage = await prisma.page.findUnique({
    where: { slug },
  });

  if (existingPage) {
    return toPlainObject(existingPage);
  }

  const page = await prisma.page.create({
    data: {
      slug,
      title,
      template: resolveTemplateForSlug(slug),
      isPublished: true,
      isActive: true,
    },
  });

  return toPlainObject(page);
}

export async function ensureSystemPageCommand(slug: string) {
  const definition = getSystemPageDefinition(slug);
  if (!definition) {
    return null;
  }

  const existingPage = await prisma.page.findUnique({
    where: { slug },
  });

  const page =
    existingPage ??
    (await prisma.page.create({
      data: {
        slug: definition.slug,
        title: definition.title,
        description: definition.description,
        template: resolveTemplateForSlug(definition.slug),
        isPublished: true,
        isActive: true,
        isSystemPage: true,
      },
    }));

  await ensurePageSections(page.id, definition.slug);

  return {
    page: toPlainObject(page),
    created: !existingPage,
  };
}

export async function createPageCommand(
  input: CreatePageInput,
): Promise<{ slug: string }> {
  await ensurePageSlugAvailable(input.slug);

  const publishedAt = input.isPublished ? new Date() : null;
  const sections = createDefaultCustomPageSections(
    input.title,
    input.description,
  );
  const page = await prisma.page.create({
    data: {
      slug: input.slug,
      title: input.title,
      description: normalizeNullableString(input.description),
      template: resolveTemplateForSlug(input.slug),
      isPublished: input.isPublished,
      publishedAt,
      isActive: true,
      sections: {
        create: sections.map((section) => ({
          type: section.type,
          title: section.title,
          config: section.config,
          contentHtml: section.content,
          order: section.order,
          isActive: section.isActive,
        })),
      },
    },
    select: { slug: true },
  });

  return page;
}

export async function deletePageCommand(slug: string): Promise<void> {
  if (isSystemPageSlug(slug)) {
    throw new DomainError("システムページは削除できません", "VALIDATION");
  }

  await ensurePageExists(slug);

  await prisma.page.update({
    where: { slug },
    data: {
      isActive: false,
      isPublished: false,
    },
  });
}

export async function deletePagePermanentlyCommand(
  slug: string,
): Promise<void> {
  if (isSystemPageSlug(slug)) {
    throw new DomainError("システムページは削除できません", "VALIDATION");
  }

  await ensurePageExists(slug);

  await prisma.page.delete({
    where: { slug },
  });
}

export async function restorePageCommand(slug: string): Promise<void> {
  const page = await ensurePageExists(slug);

  if (page.isActive) {
    throw new DomainError("このページは既にアクティブです", "VALIDATION");
  }

  await prisma.page.update({
    where: { slug },
    data: {
      isActive: true,
    },
  });
}

export async function updatePagePublishedCommand(
  slug: string,
  isPublished: boolean,
): Promise<{ isPublished: boolean }> {
  await ensurePageExists(slug);

  await prisma.page.update({
    where: { slug },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}

export async function bulkUpdatePagePublishedCommand(
  slugs: string[],
  isPublished: boolean,
): Promise<void> {
  if (slugs.length === 0) {
    throw new DomainError("対象ページが選択されていません", "VALIDATION");
  }

  await prisma.page.updateMany({
    where: {
      slug: { in: slugs },
      isActive: true,
    },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });
}

export async function bulkDeletePagesCommand(
  slugs: string[],
): Promise<{ deletedSlugs: string[] }> {
  if (slugs.length === 0) {
    throw new DomainError("対象ページが選択されていません", "VALIDATION");
  }

  const deletedSlugs = slugs.filter((slug) => !isSystemPageSlug(slug));
  if (deletedSlugs.length === 0) {
    throw new DomainError("システムページは削除できません", "VALIDATION");
  }

  await prisma.page.updateMany({
    where: {
      slug: { in: deletedSlugs },
      isActive: true,
    },
    data: {
      isActive: false,
      isPublished: false,
    },
  });

  return { deletedSlugs };
}

export async function updatePageSeoCommand(
  slug: string,
  input: UpdatePageSeoInput,
): Promise<void> {
  await ensurePageExists(slug);

  // title は schema で `min(1)` 必須のため直接保存（旧 `|| definition?.title || input.title`
  // は左辺が常に truthy で dead branch だった）
  await prisma.page.update({
    where: { slug },
    data: {
      title: input.title,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
  });
}
