import type {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";

export interface AnnouncementBarItem {
  id: string;
  message: string;
  type: string;
  linkUrl?: string | null;
  linkText?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface CarouselSettings {
  animation: AnnouncementBarAnimation;
  duration: number;
  autoPlay: boolean;
  pauseOnHover: boolean;
  showArrows: boolean;
  showIndicator: boolean;
  designStyle: AnnouncementBarDesignStyle;
  bgColor: string | null;
  textColor: string | null;
  stripeColor: string | null;
  stripeAnimation: boolean;
  gradientAnimation: boolean;
  glassAnimation: boolean;
  sticky: boolean;
}
