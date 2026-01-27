import { getPostCategories, getPostTags } from '@/admin/actions/post'
import { PostEditor } from '../_components/PostEditor'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '投稿作成 | Myrrh Rental Space',
}

export default async function NewPostPage() {
  const [categories, tags] = await Promise.all([
    getPostCategories(),
    getPostTags(),
  ])

  return <PostEditor categories={categories} tags={tags} mode="create" />
}
