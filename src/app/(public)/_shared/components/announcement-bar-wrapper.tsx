import { AnnouncementBar, type CarouselSettings } from "./announcement-bar";
import {
  getActiveAnnouncementBars,
  getAnnouncementBarCarouselSettings,
} from "@/shared/domain/settings/announcement-bar";
import type { ReactElement } from "react";
import {
  validateAnimation,
  validateDesignStyle,
} from "@/shared/lib/announcement-bar-utils";
import { toISOString } from "@/shared/lib/serialize";

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  const [bars, dbSettings] = await Promise.all([
    getActiveAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ]);

  if (bars.length === 0) return null;

  const settings: CarouselSettings = {
    animation: validateAnimation(dbSettings.announcementBarAnimation),
    duration: dbSettings.announcementBarDuration,
    autoPlay: dbSettings.announcementBarAutoPlay,
    pauseOnHover: dbSettings.announcementBarPauseOnHover,
    showArrows: dbSettings.announcementBarShowArrows,
    showIndicator: dbSettings.announcementBarShowIndicator,
    designStyle: validateDesignStyle(dbSettings.announcementBarDesignStyle),
    bgColor: dbSettings.announcementBarBgColor,
    textColor: dbSettings.announcementBarTextColor,
    stripeColor: dbSettings.announcementBarStripeColor,
    stripeAnimation: dbSettings.announcementBarStripeAnimation,
    gradientAnimation: dbSettings.announcementBarGradientAnimation,
    glassAnimation: dbSettings.announcementBarGlassAnimation,
    sticky: dbSettings.announcementBarSticky,
  };

  return (
    <AnnouncementBar
      bars={bars.map((bar) => ({
        id: bar.id,
        message: bar.message,
        type: bar.type,
        linkUrl: bar.linkUrl,
        linkText: bar.linkText,
        bgColor: bar.bgColor,
        textColor: bar.textColor,
        startAt: toISOString(bar.startAt) ?? null,
        endAt: toISOString(bar.endAt) ?? null,
      }))}
      settings={settings}
    />
  );
}
