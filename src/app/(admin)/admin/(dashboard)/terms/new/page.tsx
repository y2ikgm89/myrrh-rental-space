import { getSettings } from '@/admin/queries/settings'
import { TermsInlineEditor } from '../_components/TermsInlineEditor'
import type { BusinessInfo } from '@/shared/lib/terms-templates'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '規約作成 | Myrrh Rental Space',
}

export default async function NewTermsPage() {
  const settings = await getSettings()

  // 事業者情報を抽出
  const businessInfo: BusinessInfo = settings
    ? {
        businessName: settings.businessName,
        email: settings.email,
        phoneNumber: settings.phoneNumber,
        postalCode: settings.postalCode,
        prefecture: settings.prefecture,
        city: settings.city,
        streetAddress: settings.streetAddress,
        buildingName: settings.buildingName,
      }
    : {
        businessName: null,
        email: null,
        phoneNumber: null,
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        buildingName: null,
      }

  return <TermsInlineEditor mode="create" businessInfo={businessInfo} />
}

