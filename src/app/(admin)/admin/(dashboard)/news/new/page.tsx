import { NewsEditor } from '../_components/NewsEditor'
import { getLayoutSettings } from '@/shared/lib/settings/public'
import { getValidLayoutWidth, LayoutWidth } from '@/shared/lib/validations/enums'
import type { ContentWidth } from '@/shared/types'
import type { Metadata } from 'next'
import { connection } from "next/server";

export const metadata: Metadata = {
  title: 'お知らせ作成 | Myrrh Rental Space',
}

export default async function NewNewsPage() {
  await connection();
  const settings = await getLayoutSettings()

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  }

  return <NewsEditor mode="create" fallbackContentWidth={fallbackContentWidth} />
}
