import { getPostCategories, getPostTags } from '@/admin/actions/post'
import { PostEditor } from '../_components/PostEditor'
import { getLayoutSettings } from '@/shared/lib/settings/public'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '投稿作成 | Myrrh Rental Space',
}

export default async function NewPostPage() {
  const [categories, tags, layoutSettings] = await Promise.all([
    getPostCategories(),
    getPostTags(),
    getLayoutSettings(),
  ])

  return (
    <PostEditor
      categories={categories}
      tags={tags}
      mode="create"
      layoutSettings={layoutSettings}
    />
  )
}
