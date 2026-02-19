import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { getPostTagById } from '@/admin/actions/post'
import { TagEditor } from '../_components/TagEditor'
import { headers } from "next/headers";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  await connection()
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
  await headers();
  await connection()
  const { id } = await params
  const tag = await getPostTagById(id)

  if (!tag) {
    notFound()
  }

  return <TagEditor tag={tag} />
}
