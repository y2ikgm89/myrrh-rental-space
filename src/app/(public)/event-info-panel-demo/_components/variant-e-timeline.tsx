import {
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCoin,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "@/public/components/design-system/badge";
import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

const ENTRIES = [
  {
    icon: <IconCalendar className="h-4 w-4" aria-hidden="true" />,
    label: "開催日時",
    value: SAMPLE.startTime,
  },
  {
    icon: <IconMapPin className="h-4 w-4" aria-hidden="true" />,
    label: "開催場所",
    value: SAMPLE.venueName,
  },
  {
    icon: <IconUsers className="h-4 w-4" aria-hidden="true" />,
    label: "定員",
    value: `${SAMPLE.capacity} 名 · 残り ${SAMPLE.remaining} 名`,
  },
  {
    icon: <IconCoin className="h-4 w-4" aria-hidden="true" />,
    label: "参加費",
    value: formatPrice(SAMPLE.price),
  },
] as const;

export function VariantETimeline() {
  return (
    <aside
      aria-label="イベント情報"
      className="border border-border bg-background shadow-sm"
    >
      <div className="px-8 py-5 sm:px-10">
        <Badge variant="success">申込受付中</Badge>
      </div>
      <ol className="relative px-8 pb-8 sm:px-10">
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[2.625rem] top-0 w-px bg-divider sm:left-[3.125rem]"
        />
        {ENTRIES.map((entry, index) => (
          <TimelineRow
            key={entry.label}
            icon={entry.icon}
            label={entry.label}
            value={entry.value}
            isLast={index === ENTRIES.length - 1}
          />
        ))}
      </ol>
      <div className="border-t border-divider px-8 py-6 sm:px-10">
        <a
          href={SAMPLE.registerHref}
          className="inline-flex min-h-12 w-full items-center justify-center bg-accent px-6 text-sm font-medium tracking-[0.12em] text-accent-foreground transition-colors hover:bg-accent/90"
        >
          お申し込みへ進む
        </a>
      </div>
    </aside>
  );
}

function TimelineRow({
  icon,
  label,
  value,
  isLast,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly isLast: boolean;
}) {
  return (
    <li
      className={
        isLast
          ? "relative grid grid-cols-[2.25rem_1fr] gap-x-4 pt-6"
          : "relative grid grid-cols-[2.25rem_1fr] gap-x-4 pt-6 pb-6"
      }
    >
      <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-accent">
        {icon}
      </span>
      <div className="pt-1">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1.5 text-base leading-relaxed text-foreground">
          {value}
        </p>
      </div>
    </li>
  );
}
