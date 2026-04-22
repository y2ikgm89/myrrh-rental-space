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
import {
  ScrollReveal,
  ScrollRevealGroup,
} from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import { SectionHeader } from "@/public/components/sections/SectionHeader";
import {
  defaultSectionDesign,
  parseSectionDesign,
} from "@/shared/lib/validations/section";

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
  /** Section.design JSON（DB） */
  readonly design?: unknown;
}

const STEP_ICONS = [IconSearch, IconCalendarEvent, IconCircleCheck];
const VALUE_PROP_ICONS = [
  IconClock,
  IconCalendarCheck,
  IconWifi,
  IconCreditCard,
];

export const howItWorksDefaultProps: Omit<HowItWorksSectionProps, "design"> = {
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
  design,
}: Partial<HowItWorksSectionProps> = {}): ReactElement {
  const resolvedDesign = parseSectionDesign(design ?? defaultSectionDesign);

  return (
    <SectionWrapper design={resolvedDesign}>
      <ScrollReveal>
        <SectionHeader
          label={label}
          title={title}
          textAlign={resolvedDesign.textAlign}
          className="text-center"
        />
      </ScrollReveal>

      <ScrollRevealGroup className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 md:gap-12">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[i] ?? IconCircleCheck;
          return (
            <div key={`step-${String(i)}`} className="text-center">
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
          );
        })}
      </ScrollRevealGroup>

      <ScrollRevealGroup
        className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-6 md:mt-16 md:gap-x-16"
        stagger={0.08}
      >
        {valueProps.map((prop, i) => {
          const Icon = VALUE_PROP_ICONS[i] ?? IconClock;
          return (
            <div key={`vp-${String(i)}`} className="flex items-center gap-3">
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
          );
        })}
      </ScrollRevealGroup>
    </SectionWrapper>
  );
}
