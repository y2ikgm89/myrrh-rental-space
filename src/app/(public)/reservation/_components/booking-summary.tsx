"use client";

import type { ReactElement } from "react";
import {
  IconMapPin,
  IconCalendarEvent,
  IconClock,
  IconUsers,
  IconPencil,
} from "@tabler/icons-react";
import { Heading } from "@/public/components/design-system/heading";
import { useFormatPrice } from "@/public/hooks/use-format-price";

interface BookingSummaryProps {
  readonly locationName: string;
  readonly spaceName: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly guests: number;
  readonly price: number | null;
  readonly onEdit?: () => void;
}

function formatDateJa(dateStr: string): string {
  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

function formatDurationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  const diff = endMin - startMin;
  if (diff < 60) return `${diff}分`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/5 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function BookingSummary({
  locationName,
  spaceName,
  date,
  startTime,
  endTime,
  guests,
  price,
  onEdit,
}: BookingSummaryProps): ReactElement {
  const { formatTotal } = useFormatPrice();
  const durationLabel = formatDurationLabel(startTime, endTime);

  return (
    <div className="border border-border px-6 py-6 sm:px-8 sm:py-7">
      {/* Header: title + price */}
      <div className="flex items-baseline justify-between gap-4">
        <Heading level={3} className="!text-base">
          予約内容
        </Heading>
        {price !== null ? (
          <p className="text-xl font-light text-accent">{formatTotal(price)}</p>
        ) : null}
      </div>

      {/* Divider */}
      <div className="my-5 border-t border-border" />

      {/* Detail rows */}
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5">
        <SummaryRow
          icon={<IconMapPin size={16} />}
          label="場所"
          value={`${locationName} › ${spaceName}`}
        />
        <SummaryRow
          icon={<IconCalendarEvent size={16} />}
          label="日付"
          value={formatDateJa(date)}
        />
        <SummaryRow
          icon={<IconClock size={16} />}
          label="時間"
          value={`${startTime} → ${endTime}（${durationLabel}）`}
        />
        <SummaryRow
          icon={<IconUsers size={16} />}
          label="人数"
          value={`${guests}名`}
        />
      </div>

      {/* IconEdit button */}
      {onEdit ? (
        <>
          <div className="my-5 border-t border-border" />
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center justify-center gap-2 border border-border py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground"
          >
            <IconPencil size={14} />
            予約内容を変更する
          </button>
        </>
      ) : null}
    </div>
  );
}
