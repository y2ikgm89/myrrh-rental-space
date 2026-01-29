import { NewsEditor } from '../_components/NewsEditor'
import { getLayoutSettings } from '@/shared/lib/settings/public'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お知らせ作成 | Myrrh Rental Space',
}

export default async function NewNewsPage() {
  const layoutSettings = await getLayoutSettings()

  return <NewsEditor mode="create" layoutSettings={layoutSettings} />
}
