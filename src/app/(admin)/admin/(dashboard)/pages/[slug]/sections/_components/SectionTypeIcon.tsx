'use client'

/**
 * セクションタイプ別アイコンコンポーネント
 */

import type { LucideIcon } from 'lucide-react'
import {
  Image,
  FileText,
  Mail,
  HelpCircle,
  LayoutGrid,
  Newspaper,
  FileEdit,
  MousePointerClick,
  Images,
  Quote,
  MapPin,
  Code,
} from 'lucide-react'
import { PageSectionType } from '@/shared/lib/validations/page-section'

/**
 * セクションタイプからアイコンコンポーネントを取得
 */
export const sectionTypeIconComponents: Record<PageSectionType, LucideIcon> = {
  [PageSectionType.HERO]: Image,
  [PageSectionType.CUSTOM]: FileText,
  [PageSectionType.CONTACT_FORM]: Mail,
  [PageSectionType.FAQ_LIST]: HelpCircle,
  [PageSectionType.SPACE_LIST]: LayoutGrid,
  [PageSectionType.NEWS_LIST]: Newspaper,
  [PageSectionType.POST_LIST]: FileEdit,
  [PageSectionType.CTA]: MousePointerClick,
  [PageSectionType.GALLERY]: Images,
  [PageSectionType.TESTIMONIAL]: Quote,
  [PageSectionType.MAP]: MapPin,
  [PageSectionType.EMBED]: Code,
}

interface SectionTypeIconProps {
  type: PageSectionType
  className?: string
}

export function SectionTypeIcon({ type, className = 'h-5 w-5' }: SectionTypeIconProps) {
  const IconComponent = sectionTypeIconComponents[type]
  return <IconComponent className={className} />
}
