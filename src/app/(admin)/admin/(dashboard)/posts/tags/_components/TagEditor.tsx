"use client";

/**
 * タグエディター
 *
 * TaxonomyEditorのラッパー
 */

import { TaxonomyEditor } from "../../taxonomy/_components/TaxonomyEditor";
import type { PostTagData } from "@/shared/domain/posts/types";

type TagEditorProps = {
  tag: PostTagData;
};

export function TagEditor({ tag }: TagEditorProps) {
  return <TaxonomyEditor type="tag" data={tag} />;
}
