import { formatPrice } from "@/shared/lib/pricing/format";
import { SAMPLE } from "./shared";

const ENTRIES = [
  { label: "Date", value: SAMPLE.startTime },
  { label: "Venue", value: SAMPLE.venueName },
  {
    label: "Capacity",
    value: `${SAMPLE.capacity} 名 · 残り ${SAMPLE.remaining} 名`,
  },
  { label: "Fee", value: formatPrice(SAMPLE.price) },
] as const;

export function VariantDMinimalWhitespace() {
  return (
    <aside aria-label="イベント情報" className="bg-background">
      <p className="px-2 pt-8 text-[0.7rem] uppercase tracking-[0.18em] text-accent">
        申込受付中
      </p>
      <dl className="px-2 pb-10 pt-2">
        {ENTRIES.map((entry) => (
          <div key={entry.label} className="pt-8">
            <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {entry.label}
            </dt>
            <dd className="mt-1.5 text-base leading-relaxed text-foreground">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-2 pb-10">
        <a
          href={SAMPLE.registerHref}
          className="group inline-flex items-center gap-3 border-b border-foreground pb-1 text-[0.7rem] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <span>お申し込みへ進む</span>
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
