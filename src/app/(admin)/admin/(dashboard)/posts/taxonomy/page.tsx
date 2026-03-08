import { redirect } from 'next/navigation'

export default async function PostTaxonomyPage() {
  redirect('/admin/posts?tab=categories')
}

