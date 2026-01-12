import { notFound } from 'next/navigation'
import { getBlogPostById, getBlogCategories } from '@/actions/admin/blog'
import { BlogInlineEditor } from '../_components/BlogInlineEditor'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const post = await getBlogPostById(id)

  if (!post) {
    return {
      title: 'ブログ記事が見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${post.title} | ブログ管理 | Myrrh Rental Space`,
  }
}

export default async function EditBlogPostPage({ params }: PageProps) {
  const { id } = await params
  const [post, categories] = await Promise.all([
    getBlogPostById(id),
    getBlogCategories(),
  ])

  if (!post) {
    notFound()
  }

  return <BlogInlineEditor post={post} categories={categories} />
}
