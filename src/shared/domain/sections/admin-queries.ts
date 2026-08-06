import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  SectionType,
  type SectionConfig,
  validateSectionConfig,
} from "@/shared/lib/validations/section";
import { getDefaultSectionConfig } from "@/shared/lib/validations/section-defaults";
import type { Prisma } from "@generated/prisma/client";

const ADMIN_SECTION_SELECT = {
  id: true,
  pageId: true,
  type: true,
  config: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.SectionSelect;

/**
 * 保存されている設定を読む。**読めなかったことを潰さない。**
 *
 * 既定値へ差し替えるだけだと、編集画面は初期値を表示し、管理者が無関係な 1 項目を
 * 直して保存した時点で**本物の設定が既定値で上書きされて復旧不能**になる。
 * 顧客からは「昨日まであった案内文が消えた」「トップの画像が変わった」に見える。
 *
 * 公開描画は今までどおり既定値に落ちてよい（描けないより出す方がよい）。
 * 差し替えたことを `unreadable` で伝え、**編集経路だけが保存を止める**。
 */
function parseSectionConfig(
  type: string,
  config: unknown,
): { readonly config: SectionConfig; readonly unreadable: boolean } {
  const result = validateSectionConfig(type, config);
  if (result.success) {
    return { config: result.data, unreadable: false };
  }

  const fallback =
    getDefaultSectionConfig(type) ??
    getDefaultSectionConfig(SectionType.CUSTOM);
  if (!fallback) {
    throw new Error("セクション設定の初期化に失敗しました");
  }
  return { config: fallback, unreadable: true };
}

function toSectionData(section: {
  id: string;
  pageId: string;
  type: string;
  config: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const parsed = parseSectionConfig(section.type, section.config);
  return {
    ...section,
    config: parsed.config,
    /** DB の設定が読めず既定値へ落ちた（編集画面はこの間 保存を止める） */
    configUnreadable: parsed.unreadable,
  };
}

export async function getPageSectionsQuery(pageId: string) {
  const sections = await prisma.section.findMany({
    where: { pageId },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return sections.map((section) => toSectionData(section));
}

export async function getPublicPageSectionsQuery(pageId: string) {
  const sections = await prisma.section.findMany({
    where: { pageId, isActive: true },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return sections.map((section) => toSectionData(section));
}

export async function getPageWithSectionsQuery(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      sections: {
        select: ADMIN_SECTION_SELECT,
        orderBy: { order: "asc" },
      },
    },
  });

  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    sections: page.sections.map((section) => toSectionData(section)),
  };
}

export async function getPageForEditQuery(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      template: true,
      isPublished: true,
      isSystemPage: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      sections: {
        select: ADMIN_SECTION_SELECT,
        orderBy: { order: "asc" },
      },
    },
  });

  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    template: page.template,
    isPublished: page.isPublished,
    isSystem: page.isSystemPage,
    metaDescription: page.metaDescription,
    metaKeywords: page.metaKeywords,
    ogpTitle: page.ogpTitle,
    ogpDescription: page.ogpDescription,
    ogpImageUrl: page.ogpImageUrl,
    sections: page.sections.map((section) => toSectionData(section)),
  };
}

export async function getPageSectionQuery(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: ADMIN_SECTION_SELECT,
  });

  if (!section) {
    return null;
  }

  return toSectionData(section);
}

/** EDITOR のページ割当チェック用（権限ゲートで sectionId から pageId を解決） */
export async function getSectionPageIdQuery(
  sectionId: string,
): Promise<string | null> {
  const row = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { pageId: true },
  });
  return row?.pageId ?? null;
}
