import type { ReactElement } from "react";
import {
  IconSearch,
  IconCalendarEvent,
  IconCircleCheck,
  IconClock,
  IconCalendarCheck,
  IconWifi,
  IconCreditCard,
} from "@tabler/icons-react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface HowItWorksStep {
  readonly title: string;
  readonly description: string;
}

export interface ValueProp {
  readonly title: string;
}

export interface HowItWorksSectionProps {
  readonly label: string;
  readonly title: string;
  readonly steps: readonly HowItWorksStep[];
  readonly valueProps: readonly ValueProp[];
}

const STEP_ICONS = [IconSearch, IconCalendarEvent, IconCircleCheck];
const VALUE_PROP_ICONS = [
  IconClock,
  IconCalendarCheck,
  IconWifi,
  IconCreditCard,
];

export const howItWorksDefaultProps: HowItWorksSectionProps = {
  label: "How to Reserve",
  title: "ご利用の流れ",
  steps: [
    {
      title: "スペースを選ぶ",
      description: "用途や人数に合った空間を見つける",
    },
    {
      title: "日時を決める",
      description: "カレンダーから空き状況を確認",
    },
    {
      title: "オンラインで予約",
      description: "最短1分で予約完了",
    },
  ],
  valueProps: [
    { title: "最短1時間から" },
    { title: "当日予約OK" },
    { title: "Wi-Fi完備" },
    { title: "オンライン決済" },
  ],
};

export function HowItWorksSection({
  label = howItWorksDefaultProps.label,
  title = howItWorksDefaultProps.title,
  steps = howItWorksDefaultProps.steps,
  valueProps = howItWorksDefaultProps.valueProps,
}: Partial<HowItWorksSectionProps> = {}): ReactElement {
  return (
    <section className="px-4 py-[var(--spacing-section-compact)]">
      <div className="mx-auto max-w-[var(--container-max)]">
        <ScrollReveal>
          <div className="mb-10 text-center md:mb-14">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <h2 className="mt-4 font-heading text-[clamp(1.5rem,2.5vw,2rem)] font-light tracking-tight">
              {title}
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 md:gap-12">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? IconCircleCheck;
            return (
              <ScrollReveal key={`step-${String(i)}`} delay={i * 0.1}>
                <div className="text-center">
                  <Icon
                    className="mx-auto mb-5 text-accent"
                    size={36}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                  <span className="mb-4 block font-heading text-[2.5rem] font-light italic text-accent/50">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-heading text-[1.25rem] font-light tracking-[0.01em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[0.85rem] leading-[1.8] text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Value props strip */}
        <div className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-6 md:mt-16 md:gap-x-16">
          {valueProps.map((prop, i) => {
            const Icon = VALUE_PROP_ICONS[i] ?? IconClock;
            return (
              <ScrollReveal key={`vp-${String(i)}`} delay={i * 0.08}>
                <div className="flex items-center gap-3">
                  <Icon
                    className="text-accent"
                    size={28}
                    strokeWidth={1.2}
                    aria-hidden="true"
                  />
                  <span className="text-[0.95rem] tracking-[0.02em] text-foreground/70">
                    {prop.title}
                  </span>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
