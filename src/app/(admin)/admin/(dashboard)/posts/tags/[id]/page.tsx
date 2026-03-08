import { notFound } from 'next/navigation'
import { headers } from "next/headers";
import type { Metadata } from 'next'
import { getPostTagById } from '@/admin/queries/post'
import { TagEditor } from '../_components/TagEditor'


export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  await headers();
  const { id } = await params
  const tag = await getPostTagById(id)
  return {
    title: tag ? `${tag.name} | タグ編集` : 'タグが見つかりません',
  }
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditTagPage({ params }: PageProps) {
  const { id } = await params
  const tag = await getPostTagById(id)

  if (!tag) {
    notFound()
  }

  return <TagEditor tag={tag} />
}

