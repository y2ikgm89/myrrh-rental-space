'use client'

/**
 * ブログ記事フォーム
 *
 * @deprecated BlogInlineEditorを使用してください
 * このコンポーネントはBlogInlineEditorに置き換えられました
 */

import { BlogInlineEditor } from './BlogInlineEditor'
import type { BlogPostData, BlogCategoryData } from '@/actions/admin/blog'

type BlogFormProps = {
  post?: BlogPostData
  categories: BlogCategoryData[]
  mode: 'create' | 'edit'
}

export function BlogForm({ post, categories, mode }: BlogFormProps) {
  return (
    <BlogInlineEditor post={post} categories={categories} mode={mode} />
  )
}
