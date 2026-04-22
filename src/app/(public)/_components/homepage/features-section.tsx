import type { ReactElement } from "react";
import {
  ScrollReveal,
  ScrollRevealGroup,
} from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import { SectionHeader } from "@/public/components/sections/SectionHeader";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";

export interface FeatureItem {
  readonly title: string;
  readonly description: string;
}

export interface FeaturesSectionProps {
  readonly label: string;
  readonly title: string;
  readonly items: readonly FeatureItem[];
  /** Resolved style from 4-tier cascade (settings → page → section → override) */
  readonly resolvedStyle?: SectionStylePayload;
}

export const featuresDefaultProps: Omit<FeaturesSectionProps, "resolvedStyle"> =
  {
    label: "Why Myrrh",
    title: "選ばれる理由",
    items: [
      {
        title: "自然光設計",
        description:
          "全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。",
      },
      {
        title: "遮音性能",
        description:
          "プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。",
      },
      {
        title: "即日予約",
        description:
          "オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。",
      },
      {
        title: "柔軟なレイアウト",
        description:
          "可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。",
      },
    ],
  };

export function FeaturesSection({
  label = featuresDefaultProps.label,
  title = featuresDefaultProps.title,
  items = featuresDefaultProps.items,
  resolvedStyle = DEFAULT_SECTION_STYLE,
}: Partial<FeaturesSectionProps> = {}): ReactElement {
  return (
    <SectionWrapper style={resolvedStyle}>
      <ScrollReveal>
        <SectionHeader
          label={label}
          title={title}
          textAlign={resolvedStyle.typography.textAlign}
          className="text-center"
        />
      </ScrollReveal>

      <ScrollRevealGroup className="divide-y border-y border-border divide-border">
        {items.map((feature, i) => (
          <div
            key={`feature-${String(i)}`}
            className="grid grid-cols-[3rem_1fr] items-start gap-4 py-6 md:gap-6 md:py-8"
          >
            <span className="text-right font-heading text-[2rem] font-light italic leading-none text-accent/50">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="text-base font-normal tracking-[0.02em]">
                {feature.title}
              </h3>
              <p className="mt-1 text-[0.9rem] leading-[1.9] text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </ScrollRevealGroup>
    </SectionWrapper>
  );
}
