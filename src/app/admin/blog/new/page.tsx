import { getBlogCategories } from '@/actions/admin/blog'
import { BlogForm } from '../_components/BlogForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ブログ記事作成 | Myrrh Rental Space',
}

export default async function NewBlogPostPage() {
  const categories = await getBlogCategories()

  return <BlogForm categories={categories} mode="create" />
}
