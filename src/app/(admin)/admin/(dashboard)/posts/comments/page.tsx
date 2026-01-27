import { redirect } from 'next/navigation'

export default function CommentsPage() {
  redirect('/admin/posts?tab=comments')
}
