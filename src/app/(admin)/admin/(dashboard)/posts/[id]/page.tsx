import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getPostById, getPostCategories, getPostTags } from '@/admin/actions/post'
import { PostEditor } from '../_components/PostEditor'
import { getLayoutSettings } from '@/shared/lib/settings/public'
import { getValidLayoutWidth, LayoutWidth } from '@/shared/lib/validations/enums'
import type { ContentWidth } from '@/shared/types'
import type { Metadata } from 'next'
import { headers } from "next/headers";


type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const post = await getPostById(id)

  if (!post) {
    return {
      title: '投稿が見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${post.title} | 投稿管理 | Myrrh Rental Space`,
  }
}

export default async function EditPostPage({ params }: PageProps) {
  await headers();
  await connection()
  const { id } = await params

  const [post, categories, tags, settings] = await Promise.all([
    getPostById(id),
    getPostCategories(),
    getPostTags(),
    getLayoutSettings(),
  ])

  if (!post) {
    notFound()
  }

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  }

  return (
    <PostEditor
      post={post}
      categories={categories}
      tags={tags}
      mode="edit"
      fallbackContentWidth={fallbackContentWidth}
    />
  )
}
