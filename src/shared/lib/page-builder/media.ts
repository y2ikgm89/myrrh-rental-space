import type { PageBuilderDocument } from "./schema";

export type PageBuilderResolvedMedia = {
  id: string;
  url: string;
  alt: string | null;
  filename: string;
  width: number | null;
  height: number | null;
};

export type PageBuilderResolvedMediaMap = Record<
  string,
  PageBuilderResolvedMedia
>;

export function collectPageBuilderImageMediaIds(
  document: PageBuilderDocument,
): string[] {
  const mediaIds = new Set<string>();

  for (const node of Object.values(document.nodes)) {
    if (node.type !== "image" || node.content.mediaId === null) {
      continue;
    }

    mediaIds.add(node.content.mediaId);
  }

  return [...mediaIds];
}

export function createPageBuilderResolvedMediaMap(
  media: readonly PageBuilderResolvedMedia[],
): PageBuilderResolvedMediaMap {
  return Object.fromEntries(media.map((item) => [item.id, item]));
}
