import { redirect } from 'next/navigation'

export default function PostTaxonomyPage() {
  redirect('/admin/posts?tab=categories')
}
