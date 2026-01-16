'use client'

/**
 * お知らせフォーム
 *
 * @deprecated NewsInlineEditorを使用してください
 * このコンポーネントはNewsInlineEditorに置き換えられました
 */

import { NewsInlineEditor } from './NewsInlineEditor'
import type { NewsData } from '@/actions/admin/news'

type NewsFormProps = {
  news?: NewsData
  mode: 'create' | 'edit'
}

export function NewsForm({ news, mode }: NewsFormProps) {
  return (
    <NewsInlineEditor news={news} mode={mode} />
  )
}
