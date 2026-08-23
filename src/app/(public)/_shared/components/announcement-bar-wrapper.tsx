import { AnnouncementBar } from "./announcement-bar/announcement-bar";
import { filterBarsWithinDisplayPeriodNow } from "./announcement-bar/display-period";
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
import { toPublicCarouselSettings } from "@/shared/lib/validations/announcement-bar";

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

  // 表示期間 (startAt/endAt) は `'use cache'` producer 内ではなく、
  // `connection()` 後の request-scoped 層で絞り込む（coupon-status.ts 同型）。
  const periodVisibleBars = filterBarsWithinDisplayPeriodNow(
    bars.map((bar) => ({
      id: bar.id,
      message: bar.message,
      linkUrl: bar.linkUrl,
      linkText: bar.linkText,
      bgColor: bar.bgColor,
      textColor: bar.textColor,
      startAt: toISOString(bar.startAt) ?? null,
      endAt: toISOString(bar.endAt) ?? null,
    })),
  );

  if (periodVisibleBars.length === 0) return null;

  // 14 キーの書き写しをやめる（監査 A-18）。変換はスキーマの隣に 1 本だけ置く。
  const settings: CarouselSettings = toPublicCarouselSettings({
    ...dbSettings,
    announcementBarAnimation: validateAnimation(
      dbSettings.announcementBarAnimation,
    ),
    announcementBarDesignStyle: validateDesignStyle(
      dbSettings.announcementBarDesignStyle,
    ),
  });

  return <AnnouncementBar bars={periodVisibleBars} settings={settings} />;
}
