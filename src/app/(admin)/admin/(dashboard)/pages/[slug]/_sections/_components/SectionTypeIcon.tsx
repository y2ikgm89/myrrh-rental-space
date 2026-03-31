"use client";

/**
 * セクションタイプ別アイコンコンポーネント
 */

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconPhoto,
  IconFileText,
  IconMail,
  IconHelpCircle,
  IconLayoutGrid,
  IconNews,
  IconFileDescription,
  IconPointer,
  IconQuote,
  IconMapPin,
  IconCode,
  IconStack2,
  IconBulb,
  IconLayoutList,
  IconStar,
  IconAperture,
} from "@tabler/icons-react";
import { SectionType } from "@/shared/lib/validations/section";

/**
 * セクションタイプからアイコンコンポーネントを取得
 */
export const sectionTypeIconComponents: Record<SectionType, TablerIcon> = {
  [SectionType.HERO]: IconPhoto,
  [SectionType.HERO_PARALLAX]: IconStack2,
  [SectionType.CUSTOM]: IconFileText,
  [SectionType.CONCEPT]: IconBulb,
  [SectionType.CONTACT_FORM]: IconMail,
  [SectionType.FAQ_LIST]: IconHelpCircle,
  [SectionType.SPACE_LIST]: IconLayoutGrid,
  [SectionType.SPACE_SHOWCASE]: IconLayoutList,
  [SectionType.NEWS_LIST]: IconNews,
  [SectionType.POST_LIST]: IconFileDescription,
  [SectionType.FEATURES]: IconStar,
  [SectionType.CTA]: IconPointer,
  [SectionType.GALLERY]: IconPhoto,
  [SectionType.TESTIMONIAL]: IconQuote,
  [SectionType.MAP]: IconMapPin,
  [SectionType.EMBED]: IconCode,
  [SectionType.INSTAGRAM]: IconAperture,
};

interface SectionTypeIconProps {
  type: SectionType;
  className?: string;
}

export function SectionTypeIcon({
  type,
  className = "h-5 w-5",
}: SectionTypeIconProps) {
  const IconComponent = sectionTypeIconComponents[type];
  return <IconComponent className={className} />;
}
