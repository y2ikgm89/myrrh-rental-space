import { IconCalendar, IconMapPin, IconUsers } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "@/public/components/design-system/badge";
import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

export function VariantFBentoGrid() {
  return (
    <aside aria-label="イベント情報" className="space-y-3">
      <div className="flex items-center justify-between border border-border bg-background px-5 py-3 shadow-sm">
        <Badge variant="success">申込受付中</Badge>
        <span className="text-xs text-muted-foreground">
          残り {SAMPLE.remaining} 名
        </span>
      </div>
      <div className="border border-border bg-foreground px-6 py-7 text-background shadow-sm">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-background/60">
          参加費 / 1 名
        </p>
        <p className="mt-2 font-heading text-[2.5rem] font-light leading-none">
          {formatPrice(SAMPLE.price)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BentoCard
          icon={<IconCalendar className="h-4 w-4" aria-hidden="true" />}
          label="日時"
          primary="5/15 (金)"
          secondary="10:00 - 12:00"
        />
        <BentoCard
          icon={<IconMapPin className="h-4 w-4" aria-hidden="true" />}
          label="会場"
          primary={SAMPLE.venueName}
          secondary="2F"
        />
        <BentoCard
          icon={<IconUsers className="h-4 w-4" aria-hidden="true" />}
          label="定員"
          primary={`${SAMPLE.capacity} 名`}
          secondary={`残 ${SAMPLE.remaining}`}
        />
        <BentoCard label="形式" primary="少人数" secondary="ワークショップ" />
      </div>
      <a
        href={SAMPLE.registerHref}
        className="inline-flex min-h-12 w-full items-center justify-center border border-border bg-accent px-6 text-sm font-medium tracking-[0.12em] text-accent-foreground shadow-sm transition-colors hover:bg-accent/90"
      >
        お申し込みへ進む
      </a>
    </aside>
  );
}

function BentoCard({
  icon,
  label,
  primary,
  secondary,
}: {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly primary: string;
  readonly secondary?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-background px-5 py-5 shadow-sm">
      <div className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
        {icon ? <span className="text-accent">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div>
        <p className="font-heading text-lg font-light leading-none text-foreground">
          {primary}
        </p>
        {secondary ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
    </div>
  );
}
