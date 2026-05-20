import { IconCalendar, IconMapPin, IconUsers } from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

export function VariantAHeroPrice() {
  return (
    <aside
      aria-label="イベント情報"
      className="border border-border bg-background shadow-sm"
    >
      <div className="px-8 py-5 sm:px-10">
        <Badge variant="success">申込受付中</Badge>
      </div>
      <div className="border-t border-divider bg-surface px-8 py-8 text-center sm:px-10">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          参加費
        </p>
        <p className="mt-2 font-heading text-[2.75rem] font-light leading-none text-foreground">
          {formatPrice(SAMPLE.price)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">税込 / 1 名</p>
      </div>
      <ul className="border-t border-divider px-8 sm:px-10">
        <CompactRow
          icon={<IconCalendar className="h-4 w-4" aria-hidden="true" />}
          label="開催日時"
          value={SAMPLE.startTime}
        />
        <CompactRow
          icon={<IconMapPin className="h-4 w-4" aria-hidden="true" />}
          label="開催場所"
          value={SAMPLE.venueName}
        />
        <CompactRow
          icon={<IconUsers className="h-4 w-4" aria-hidden="true" />}
          label="定員"
          value={`${SAMPLE.capacity} 名（残り ${SAMPLE.remaining} 名）`}
        />
      </ul>
      <div className="border-t border-divider px-8 py-6 sm:px-10">
        <a
          href={SAMPLE.registerHref}
          className="inline-flex min-h-12 w-full items-center justify-center bg-accent px-6 py-3 text-sm font-medium tracking-[0.12em] text-accent-foreground transition-colors hover:bg-accent/90"
        >
          お申し込みへ進む
        </a>
      </div>
    </aside>
  );
}

function CompactRow({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-divider py-4 first:border-t-0">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-accent">{icon}</span>
        <span>{label}</span>
      </span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </li>
  );
}
