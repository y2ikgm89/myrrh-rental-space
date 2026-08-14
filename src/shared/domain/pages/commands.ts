import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowedManagedImageUrl } from "@/shared/domain/media/managed-image-assertions";
import { toPlainObject } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/domain/slugs/validation";
import { ensurePageSections } from "@/shared/domain/pages/system-pages-server";
import {
  getSystemPageDefinition,
  isSystemPageSlug,
  type CreatePageInput,
  type UpdatePageSeoInput,
} from "@/shared/lib/validations/page";
import { createDefaultCustomPageSections } from "@/shared/lib/constants/default-page-sections";
import { resolveTemplateForSlug } from "@/shared/lib/sections/page-templates";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

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
        template: resolveTemplateForSlug(definition.slug),
        isPublished: true,
        isActive: true,
        isSystemPage: true,
      },
    }));

  // 既定セクションを流すのは **Page 行を新規作成したときだけ**（監査 F-53）。
  //
  // 旧実装は既存ページでも毎回「DEFAULT_PAGE_SECTIONS にあって DB に無い type」を
  // 欠落とみなして再作成していた。管理者が custom セクションを削除すると、
  // 削除アクションの `revalidateTag` で編集ルートが再レンダーされ、ここが再び走って
  // **コード同梱のデモ文言つきで復活する**。編集画面を開かなくても、admin の
  // コールドスタート時に `bootstrapSystemPages()` が全システムページで同じことを
  // する。公開ページに未承認の初期文言が再掲載される。
  //
  // 必須セクション（`isRequiredSectionForTemplate`）は削除も非表示も拒否されるので、
  // 「既存ページで必須が欠ける」経路は無い。
  if (!existingPage) {
    await ensurePageSections(page.id, definition.slug);
  }

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
  const sections = createDefaultCustomPageSections(input.title);

  try {
    const page = await prisma.page.create({
      data: {
        slug: input.slug,
        title: input.title,
        template: resolveTemplateForSlug(input.slug),
        isPublished: input.isPublished,
        publishedAt,
        isActive: true,
        sections: {
          create: sections.map((section) => ({
            type: section.type,
            config: section.config,
            order: section.order,
            isActive: section.isActive,
          })),
        },
      },
      select: { slug: true },
    });

    return page;
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "Page.slug")) {
      throw new DomainError(
        getSlugErrorMessage({
          type: "conflict",
          contentType: "page",
          id: "unknown",
          // P2002 からは相手の行が判らない。unique が掛かるのは active 行なので false。
          trashed: false,
        }),
        "CONFLICT",
      );
    }
    throw error;
  }
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
  if (isSystemPageSlug(slug)) {
    throw new DomainError(
      "システムページは公開状態を変更できません",
      "VALIDATION",
    );
  }

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
): Promise<{ count: number }> {
  if (slugs.length === 0) {
    throw new DomainError("対象ページが選択されていません", "VALIDATION");
  }

  const publishableSlugs = slugs.filter((slug) => !isSystemPageSlug(slug));
  if (publishableSlugs.length === 0) {
    throw new DomainError(
      "システムページは公開状態を変更できません",
      "VALIDATION",
    );
  }

  const result = await prisma.page.updateMany({
    where: {
      slug: { in: publishableSlugs },
      isActive: true,
    },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { count: result.count };
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
  assertAllowedManagedImageUrl("OGP画像", input.ogpImageUrl);
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
