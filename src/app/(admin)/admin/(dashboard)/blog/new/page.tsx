import { getBlogCategories } from '@/actions/admin/blog'
import { BlogInlineEditor } from '../_components/BlogInlineEditor'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ブログ記事作成 | Myrrh Rental Space',
}

export default async function NewBlogPostPage() {
  const categories = await getBlogCategories()

  return <BlogInlineEditor categories={categories} mode="create" />
}
