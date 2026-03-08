import { notFound } from 'next/navigation'
import { headers } from "next/headers";
import type { Metadata } from 'next'
import { getPostCategoryById } from '@/admin/queries/post'
import { CategoryEditor } from '../_components/CategoryEditor'


export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  await headers();
  const { id } = await params
  const category = await getPostCategoryById(id)
  return {
    title: category ? `${category.name} | カテゴリ編集` : 'カテゴリが見つかりません',
  }
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params
  const category = await getPostCategoryById(id)

  if (!category) {
    notFound()
  }

  return <CategoryEditor category={category} />
}

