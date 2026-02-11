'use client'

/**
 * セクション編集 Client Wrapper
 *
 * SectionEditor を wrap し、専用ページ用に showHeader={false} を渡す。
 * 保存・戻る操作でセクション一覧画面へ遷移する。
 */

import { useRouter } from 'next/navigation'
import { SectionEditor } from '@/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor'
import type { HomepageSectionData } from '@/admin/actions/homepage-settings'

interface SectionEditWrapperProps {
  section: HomepageSectionData
}

export function SectionEditWrapper({ section }: SectionEditWrapperProps) {
  const router = useRouter()

  const handleBack = () => {
    router.push('/admin/pages/homepage/edit?tab=sections')
  }

  const handleSave = () => {
    router.push('/admin/pages/homepage/edit?tab=sections')
  }

  return (
    <SectionEditor
      section={section}
      onBack={handleBack}
      onSave={handleSave}
      showHeader={false}
    />
  )
}
