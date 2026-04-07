import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface FeatureItem {
  readonly title: string;
  readonly description: string;
}

export interface FeaturesSectionProps {
  readonly label: string;
  readonly title: string;
  readonly items: readonly FeatureItem[];
}

export const featuresDefaultProps: FeaturesSectionProps = {
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
}: Partial<FeaturesSectionProps> = {}): ReactElement {
  return (
    <section className="py-[var(--spacing-section-compact)]">
      <div className="mx-auto max-w-[40rem] px-4 md:px-6">
        <ScrollReveal>
          <div className="mb-10 text-center md:mb-14">
            <p className="text-[0.8rem] uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <h2 className="mt-4 font-heading text-[clamp(2rem,4vw,3rem)] font-light tracking-tight">
              {title}
            </h2>
          </div>
        </ScrollReveal>

        <div>
          {items.map((feature, i) => (
            <ScrollReveal key={`feature-${String(i)}`} delay={i * 0.08}>
              <div
                className={cn(
                  "grid grid-cols-[3rem_1fr] gap-4 border-b border-border py-6 md:gap-6 md:py-8",
                  i === 0 && "border-t",
                )}
              >
                <span className="text-right font-heading text-[2rem] font-light italic leading-[1.3] text-accent/50">
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
