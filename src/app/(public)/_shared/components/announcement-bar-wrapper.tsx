import { AnnouncementBar } from "./announcement-bar/announcement-bar";
import { filterBarsWithinDisplayPeriod } from "./announcement-bar/display-period";
import type { CarouselSettings } from "./announcement-bar/types";
import {
  getActiveAnnouncementBars,
  getAnnouncementBarCarouselSettings,
} from "@/shared/domain/settings/announcement-bar";
import type { ReactElement } from "react";
import { connection } from "next/server";
import {
  validateAnimation,
  validateDesignStyle,
} from "@/shared/lib/announcement-bar-utils";
import { toISOString } from "@/shared/lib/serialize";

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  // build-time prerender 汚染を回避する (Footer / HeaderWithData と同型)。
  // safeFetch fallback の null/[] が静的シェルに焼き込まれると、active な bar 設定があっても
  // 表示されなくなる。`await connection()` で runtime 動的化を強制し、Cloud Run 実 DB から
  // real data で resume する。親 layout は本コンポーネントを Suspense でラップしている。
  await connection();
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

  const mappedBars = bars.map((bar) => ({
    id: bar.id,
    message: bar.message,
    linkUrl: bar.linkUrl,
    linkText: bar.linkText,
    bgColor: bar.bgColor,
    textColor: bar.textColor,
    startAt: toISOString(bar.startAt) ?? null,
    endAt: toISOString(bar.endAt) ?? null,
  }));

  // Server Component 側で表示期間 (startAt/endAt) を pre-filter し、Client
  // Component には既に表示可能なバーだけを渡す（render 中の `new Date()` を
  // helper に閉じ込めて React Compiler `purity` ルールに準拠する公式パターン。
  // coupon-status.ts と同型）。Client 側で `new Date()` を呼ぶ必要がなくなり、
  // SSR/hydration 間で表示期間の境界を跨いだ場合の DOM subtree hydration
  // mismatch も構造的に発生しなくなる。
  const displayableBars = filterBarsWithinDisplayPeriod(mappedBars);

  if (displayableBars.length === 0) return null;

  return <AnnouncementBar bars={displayableBars} settings={settings} />;
}
