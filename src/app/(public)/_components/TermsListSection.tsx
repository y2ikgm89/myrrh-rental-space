import type { ReactElement } from "react";
import Link from "next/link";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { CONTAINER_WIDTH_MAP } from "@/public/lib/section-style-maps";
import { parseContainerWidth } from "@/shared/lib/validations/section-parsers";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";
import { cn } from "@/shared/lib/cn";
import type { TermsListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type { PublicTermsListItem } from "@/shared/domain/terms/queries";

interface TermsListSectionProps {
  readonly config: TermsListConfig;
  readonly style: SectionStylePayload;
  readonly items: readonly PublicTermsListItem[];
}

/**
 * TermsListSection — 公開中の規約（TermsDocument）一覧
 *
 * location-list と同様「これが一覧の全体」であり件数上限・ページネーションは持たない。
 * /terms の terms-list section 経由でのみ使われる（他ページからの流用は想定しない）。
 */
export function TermsListSection({
  config,
  style,
  items,
}: TermsListSectionProps): ReactElement {
  const containerWidth =
    CONTAINER_WIDTH_MAP[parseContainerWidth(config.layout.containerWidth)];

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className={cn("mx-auto", containerWidth)}>
        {config.title.length > 0 && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            )}
            <div style={getTitleStyle(style)}>
              <Heading
                level={2}
                className={cn("mt-4", getTitleClasses(style), "tracking-tight")}
              >
                <PortableTextSpans spans={config.title} />
              </Heading>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-muted-foreground">
            現在公開中の規約はありません。
          </p>
        ) : (
          <ul className="divide-y divide-divider">
            {items.map((item) => (
              <li key={item.id} className="py-6">
                <Link
                  href={`/terms/${item.slug}`}
                  className="group block transition-colors hover:bg-accent/5"
                >
                  <div className="text-xs uppercase tracking-eyebrow text-muted-foreground">
                    {TERMS_TYPE_LABELS[item.type] ?? item.type}
                  </div>
                  <div className="mt-2 font-heading text-xl font-light text-foreground transition-colors group-hover:text-accent">
                    {item.title}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionWrapper>
  );
}
