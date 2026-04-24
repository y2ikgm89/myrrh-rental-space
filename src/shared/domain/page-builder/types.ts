import type { PageBuilderResolvedMediaMap } from "@/shared/lib/page-builder/media";
import type { PageBuilderDocument } from "@/shared/lib/page-builder/schema";

type DateLike = Date | string;

export type PageBuilderRevisionKind = "draft" | "published";

export type PageBuilderRevisionSummary = {
  id: string;
  version: number;
  kind: PageBuilderRevisionKind;
  createdAt: DateLike;
};

export function coercePageBuilderRevisionKind(
  value: string,
): PageBuilderRevisionKind {
  return value === "published" ? "published" : "draft";
}

export type PageBuilderForEdit = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  media: PageBuilderResolvedMediaMap;
  isPublished: boolean;
  publishedAt: DateLike | null;
  draftDocument: PageBuilderDocument;
  publishedDocument: PageBuilderDocument | null;
  draftVersion: number;
  publishedVersion: number | null;
  lastPublishedAt: DateLike | null;
  updatedAt: DateLike;
  revisions: PageBuilderRevisionSummary[];
};

export type PublishedPageBuilder = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  media: PageBuilderResolvedMediaMap;
  document: PageBuilderDocument;
};
