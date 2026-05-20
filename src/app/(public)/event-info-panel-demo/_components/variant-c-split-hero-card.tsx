import { IconCalendar, IconMapPin, IconUsers } from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

export function VariantCSplitHeroCard() {
  return (
    <aside
      aria-label="イベント情報"
      className="overflow-hidden border border-border bg-background shadow-sm"
    >
      <div className="bg-surface px-8 pb-7 pt-7 sm:px-10">
        <Badge variant="success">申込受付中</Badge>
        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-heading text-[2.5rem] font-light leading-none text-foreground">
            {formatPrice(SAMPLE.price)}
          </span>
          <span className="text-xs text-muted-foreground">税込</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          残り{" "}
          <span className="font-medium text-accent">{SAMPLE.remaining} 席</span>{" "}
          / {SAMPLE.capacity} 名
        </p>
      </div>
      <dl className="px-8 sm:px-10">
        <DetailRow
          icon={<IconCalendar className="h-4 w-4" aria-hidden="true" />}
          label="開催日時"
        >
          {SAMPLE.startTime}
        </DetailRow>
        <DetailRow
          icon={<IconMapPin className="h-4 w-4" aria-hidden="true" />}
          label="開催場所"
        >
          {SAMPLE.venueName}
        </DetailRow>
        <DetailRow
          icon={<IconUsers className="h-4 w-4" aria-hidden="true" />}
          label="形式"
        >
          少人数 ワークショップ
        </DetailRow>
      </dl>
      <div className="px-8 pb-6 sm:px-10">
        <a
          href={SAMPLE.registerHref}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium tracking-[0.08em] text-background transition-colors hover:bg-foreground/90"
        >
          お申し込みへ進む
        </a>
      </div>
    </aside>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-2 pt-4 text-xs text-muted-foreground">
        <span className="text-accent">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd className="mb-4 mt-1.5 text-sm leading-relaxed text-foreground">
        {children}
      </dd>
    </>
  );
}
