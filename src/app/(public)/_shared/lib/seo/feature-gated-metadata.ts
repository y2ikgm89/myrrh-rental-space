import "server-only";

import type { Metadata } from "next";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import type { FeatureModule } from "@/shared/lib/features/registry";

/** Next.js Metadata API の noindex（Google soft-404 / 一時障害時の fail-closed）。 */
export const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
} as const satisfies NonNullable<Metadata["robots"]>;

/**
 * indexable にしない metadata を組み立てる。
 * Feature OFF・非公開・generateMetadata 失敗時の共通形。
 */
export function createNoindexMetadata(
  title: string,
  options?: { readonly description?: string },
): Metadata {
  return {
    title,
    ...(options?.description !== undefined && {
      description: options.description,
    }),
    robots: NOINDEX_ROBOTS,
  };
}

/** Feature OFF 時の metadata（notFound 相当の noindex、canonical/OG は出さない）。 */
export const FEATURE_DISABLED_PAGE_METADATA: Metadata =
  createNoindexMetadata("ページが見つかりません");

/**
 * generateMetadata が DB 等で失敗したときの fail-closed fallback。
 * 表示用 title/description は残しつつ index させない（一時障害の誤インデックス防止）。
 */
export function createMetadataErrorFallback(
  title: string,
  description?: string,
): Metadata {
  return createNoindexMetadata(title, {
    ...(description !== undefined && { description }),
  });
}

export async function withFeatureGate(
  module: FeatureModule,
  build: () => Promise<Metadata>,
): Promise<Metadata> {
  if (!(await isFeatureEnabled(module))) {
    return FEATURE_DISABLED_PAGE_METADATA;
  }
  return build();
}
