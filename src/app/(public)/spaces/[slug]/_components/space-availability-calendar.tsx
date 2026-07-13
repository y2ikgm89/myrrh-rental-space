"use client";

import { useState, type ReactElement } from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { DayPicker } from "@daypicker/react";
import { ja } from "@daypicker/react/locale";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";
import {
  getWeekdayKey,
  formatDateString,
  isMonthlyClosureDate,
} from "@/shared/lib/reservation/time-slots-utils";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface SpaceAvailabilityCalendarProps {
  readonly spaceId: string;
  readonly businessHours: BusinessHours | null;
  readonly blockedRanges: readonly BlockedDateRange[];
}

/**
 * spaces 詳細ページに埋め込む「空き状況ミニカレンダー」。
 *
 * 定休 / 臨時休業 / 過去日を disabled で grey-out することで一目で
 * 予約可能日が分かる view-only カレンダー。時間帯の空き有無は含めない
 * (per-day のスロット問い合わせは高コストで CDN cacheable でないため、
 * 日単位の gate のみ)。日付を選ぶと `/reservation?spaceId=` へ遷移して
 * 予約フォームで時間帯選択に進める導線を提供する。
 */
export function SpaceAvailabilityCalendar({
  spaceId,
  businessHours,
  blockedRanges,
}: SpaceAvailabilityCalendarProps): ReactElement {
  const [minDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const isBlockedDay = (date: Date): boolean => {
    if (blockedRanges.length === 0) return false;
    const dateStr = formatDateString(date);
    return blockedRanges.some(
      (range) => dateStr >= range.startDate && dateStr <= range.endDate,
    );
  };

  const isDisabledDay = (date: Date): boolean => {
    if (date < minDate) return true;
    if (isBlockedDay(date)) return true;
    if (!businessHours) return false;
    if (isMonthlyClosureDate(date, businessHours.monthlyClosures)) return true;
    const weekday = getWeekdayKey(date);
    const daySettings = businessHours[weekday];
    return !daySettings.isOpen || daySettings.slots.length === 0;
  };

  return (
    <section
      id="space-availability"
      aria-labelledby="space-availability-heading"
      className="border border-border p-6 md:p-8"
    >
      <p className="mb-2 text-xs uppercase tracking-eyebrow-wide text-accent">
        — Availability —
      </p>
      <h2
        id="space-availability-heading"
        className="mb-6 text-lg font-medium text-foreground"
      >
        空き状況
      </h2>
      <div className="rdp-theme">
        <DayPicker
          mode="single"
          locale={ja}
          disabled={isDisabledDay}
          showOutsideDays={false}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        グレーの日付は定休日・休業日・過去日です。実際の時間帯別空き状況は予約フォームでご確認ください。
      </p>
      <div className="mt-6">
        <Link
          href={toAppRoute(`/reservation?spaceId=${spaceId}`)}
          className="inline-flex min-h-11 items-center gap-2 border border-foreground bg-foreground px-6 text-xs uppercase tracking-eyebrow text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>予約フォームへ進む</span>
          <IconArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
