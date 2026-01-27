'use client'

/**
 * タグエディター
 *
 * TaxonomyEditorのラッパー
 */

import { TaxonomyEditor } from '../../taxonomy/_components/TaxonomyEditor'
import type { PostTagData } from '@/admin/lib/validations/post'

type TagEditorProps = {
  tag: PostTagData
}

export function TagEditor({ tag }: TagEditorProps) {
  return <TaxonomyEditor type="tag" data={tag} />
}
