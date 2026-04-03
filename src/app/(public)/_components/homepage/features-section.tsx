import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface FeatureItem {
  readonly title: string;
  readonly description: string;
}

export interface FeaturesSectionProps {
  readonly title: string;
  readonly items: readonly FeatureItem[];
}

export const featuresDefaultProps: FeaturesSectionProps = {
  title: "Why Myrrh",
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
  title = featuresDefaultProps.title,
  items = featuresDefaultProps.items,
}: Partial<FeaturesSectionProps> = {}): ReactElement {
  return (
    <section className="bg-background py-[var(--spacing-section)]">
      <div className="mx-auto max-w-[40rem] px-4 md:px-6">
        <ScrollReveal>
          <div className="mb-10 text-center md:mb-14">
            <h2 className="text-h2 font-heading font-light tracking-tight">
              {title}
            </h2>
          </div>
        </ScrollReveal>

        <div>
          {items.map((feature, i) => (
            <ScrollReveal key={`feature-${String(i)}`} delay={i * 0.08}>
              <div
                className={`grid grid-cols-[3rem_1fr] gap-4 py-6 md:gap-6 md:py-8${
                  i === 0 ? " border-t border-border" : ""
                } border-b border-border`}
              >
                <span className="text-right font-heading text-[1.5rem] font-light leading-[1.3] text-border">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[0.9rem] font-normal tracking-[0.02em]">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-[0.8rem] leading-[1.9] text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
