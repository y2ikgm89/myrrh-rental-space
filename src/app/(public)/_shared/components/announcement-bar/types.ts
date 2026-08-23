import type { PortableTextSpan } from "@/shared/lib/portable-text";
import type { PublicCarouselSettings } from "@/shared/lib/validations/announcement-bar";

export interface AnnouncementBarItem {
  id: string;
  message: PortableTextSpan[];
  linkUrl?: string | null;
  linkText?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

/**
 * 公開レンダラのカルーセル設定。スキーマ由来（監査 A-18）。
 * prefix の有無の変換は `toPublicCarouselSettings` 1 本に閉じてある。
 */
export type CarouselSettings = PublicCarouselSettings;
