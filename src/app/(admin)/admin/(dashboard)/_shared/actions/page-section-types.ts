/**
 * ページセクション Server Actions の共有型定義
 *
 * `"use server"` ファイルは async 関数のみを export 可能という Next.js 仕様に従い、
 * 型定義はこの非 server-action ファイルに分離する。
 */

import type { SectionConfig } from "@/shared/lib/validations/section";

export type PageSectionData = {
  id: string;
  pageId: string;
  type: string;
  title: string | null;
  config: SectionConfig;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PageWithSections = {
  id: string;
  slug: string;
  title: string;
  sections: PageSectionData[];
};

export type PageForEdit = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  isSystem: boolean;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  sections: PageSectionData[];
};
