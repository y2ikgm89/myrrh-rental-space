import { NewsEditor } from '../_components/NewsEditor'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お知らせ作成 | Myrrh Rental Space',
}

export default function NewNewsPage() {
  return <NewsEditor mode="create" />
}
