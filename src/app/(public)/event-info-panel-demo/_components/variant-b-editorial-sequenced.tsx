import { Badge } from "@/public/components/design-system/badge";
import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

const ENTRIES = [
  { num: "01", label: "Date", value: SAMPLE.startTime },
  { num: "02", label: "Venue", value: SAMPLE.venueName },
  {
    num: "03",
    label: "Capacity",
    value: `${SAMPLE.capacity} 名 / 残り ${SAMPLE.remaining} 名`,
  },
  { num: "04", label: "Fee", value: formatPrice(SAMPLE.price) },
] as const;

export function VariantBEditorialSequenced() {
  return (
    <aside
      aria-label="イベント情報"
      className="border border-border bg-background shadow-sm"
    >
      <div className="px-10 py-7 text-center">
        <p className="font-heading text-base italic leading-none text-muted-foreground">
          Information
        </p>
        <div aria-hidden="true" className="mx-auto mt-4 h-px w-12 bg-accent" />
      </div>
      <dl className="px-10 pb-2">
        {ENTRIES.map((entry) => (
          <div
            key={entry.num}
            className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-t border-divider py-5 first:border-t-0"
          >
            <dt className="font-heading text-lg italic leading-none text-accent">
              {entry.num}
            </dt>
            <dd>
              <p className="font-heading text-sm italic leading-none text-muted-foreground">
                {entry.label}
              </p>
              <p className="mt-2 text-base leading-relaxed text-foreground">
                {entry.value}
              </p>
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-divider px-10 py-6 text-center">
        <Badge variant="success">申込受付中</Badge>
      </div>
      <div className="border-t border-divider px-10 py-6">
        <a
          href={SAMPLE.registerHref}
          className="group inline-flex min-h-12 w-full items-center justify-between border border-foreground px-6 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          <span>Reserve a seat</span>
          <span
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </a>
      </div>
    </aside>
  );
}
