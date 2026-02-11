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
  Layers,
  Lightbulb,
  LayoutList,
  Star,
  Instagram,
} from 'lucide-react'
import { SectionType } from '@/shared/lib/validations/section'

/**
 * セクションタイプからアイコンコンポーネントを取得
 */
export const sectionTypeIconComponents: Record<SectionType, LucideIcon> = {
  [SectionType.HERO]: Image,
  [SectionType.HERO_PARALLAX]: Layers,
  [SectionType.CUSTOM]: FileText,
  [SectionType.CONCEPT]: Lightbulb,
  [SectionType.CONTACT_FORM]: Mail,
  [SectionType.FAQ_LIST]: HelpCircle,
  [SectionType.SPACE_LIST]: LayoutGrid,
  [SectionType.SPACE_SHOWCASE]: LayoutList,
  [SectionType.NEWS_LIST]: Newspaper,
  [SectionType.POST_LIST]: FileEdit,
  [SectionType.FEATURES]: Star,
  [SectionType.CTA]: MousePointerClick,
  [SectionType.GALLERY]: Images,
  [SectionType.TESTIMONIAL]: Quote,
  [SectionType.MAP]: MapPin,
  [SectionType.EMBED]: Code,
  [SectionType.INSTAGRAM]: Instagram,
}

interface SectionTypeIconProps {
  type: SectionType
  className?: string
}

export function SectionTypeIcon({ type, className = 'h-5 w-5' }: SectionTypeIconProps) {
  const IconComponent = sectionTypeIconComponents[type]
  return <IconComponent className={className} />
}
