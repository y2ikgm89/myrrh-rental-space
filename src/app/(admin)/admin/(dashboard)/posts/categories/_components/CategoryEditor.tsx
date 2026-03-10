"use client";

/**
 * カテゴリエディター
 *
 * TaxonomyEditorのラッパー
 */

import { TaxonomyEditor } from "../../taxonomy/_components/TaxonomyEditor";
import type { PostCategoryData } from "@/shared/domain/posts/types";

type CategoryEditorProps = {
  category: PostCategoryData;
};

export function CategoryEditor({ category }: CategoryEditorProps) {
  return <TaxonomyEditor type="category" data={category} />;
}
