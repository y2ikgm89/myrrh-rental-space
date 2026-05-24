/**
 * ValuePropsSection — Editorial Hairline Strip
 *
 * Hero と showcase の間に置かれる USP 帯。Aesop / Hermès / Apple のスペックストリップ準拠。
 *
 * 構造:
 *  - viewport 全幅の `border-y` hairline（section element）
 *  - max-width 1280px の grid + `divide-x divide-y md:divide-y-0`（外周は出ない）
 *  - 各 cell に icon (Tabler) + eyebrow (serif italic) + label (sans) を中央揃えで縦積み
 *
 * Adaptive grid:
 *  - 2 items: 2-col（mobile/desktop 共通）
 *  - 3 items: mobile 1-col 縦積み（orphan 回避）/ desktop 3-col
 *  - 4 items: mobile 2x2 / desktop 4-col（推奨）
 *
 * schema 契約により items は 2-4 件に制約されているため、
 * クランプ（length > 4）は読み取り側で行わない（schema が writes-side で reject）。
 */

import {
  IconCalendarCheck,
  IconClock,
  IconCreditCard,
  IconWifi,
} from "@tabler/icons-react";
import { createElement, type ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { cn } from "@/shared/lib/cn";
import type { ValuePropsConfig } from "@/shared/lib/sections/definitions/value-props/schema";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { spansToPlainText } from "@/shared/lib/portable-text";
import type {
  LayoutAnimate,
  LayoutContainerWidth,
} from "@/shared/lib/sections/definitions/_shared/layout";

interface ValuePropsSectionProps {
  readonly config: ValuePropsConfig;
}

/** 項目数 → grid columns class */
const GRID_COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2 divide-x divide-divider",
  3: "grid-cols-1 divide-y divide-divider @md:grid-cols-3 @md:divide-x @md:divide-y-0",
  4: "grid-cols-2 divide-x divide-y divide-divider @md:grid-cols-4 @md:divide-y-0",
};

const CONTAINER_MAX_WIDTH: Record<LayoutContainerWidth, string> = {
  sm: "max-w-[var(--prose-narrow)]",
  md: "max-w-[var(--prose-medium)]",
  lg: "max-w-[var(--container-max)]",
  xl: "max-w-[var(--container-editorial)]",
  full: "max-w-none",
};

/**
 * Tabler Icons の dynamic import は async SC 制約があるため、
 * value-props で利用頻度の高い 4 アイコンは static import + map で同期解決する。
 * 未登録 icon 名が来た場合は icon を render しない（schema の `field.icon` が
 * 任意文字列を許容するため、ここで防御）。
 */
const STATIC_ICON_MAP = {
  IconClock,
  IconCalendarCheck,
  IconWifi,
  IconCreditCard,
} as const;

type StaticIconName = keyof typeof STATIC_ICON_MAP;

function isStaticIcon(name: string): name is StaticIconName {
  return name in STATIC_ICON_MAP;
}

export function ValuePropsSection({
  config,
}: ValuePropsSectionProps): ReactElement | null {
  const itemCount = config.items.length;
  // schema で min:2 / max:4 を保証しているが、安全側で render-time クランプ
  // + 型ガード経由で literal narrowing し `as` キャストを回避
  const gridColsClass =
    itemCount === 2
      ? GRID_COLS[2]
      : itemCount === 3
        ? GRID_COLS[3]
        : itemCount === 4
          ? GRID_COLS[4]
          : null;
  if (gridColsClass === null) return null;
  const maxWidthClass = CONTAINER_MAX_WIDTH[config.layout.containerWidth];
  const animate: LayoutAnimate = config.layout.animateOnScroll;

  const grid = (
    <div
      className={cn(
        "mx-auto grid divide-divider",
        maxWidthClass,
        gridColsClass,
      )}
    >
      {config.items.map((item) => {
        const iconElement =
          item.icon && isStaticIcon(item.icon)
            ? createElement(STATIC_ICON_MAP[item.icon], {
                className: "text-accent",
                size: 22,
                strokeWidth: 1.2,
                "aria-hidden": "true",
              })
            : null;

        return (
          <div
            key={`${item.eyebrow}-${spansToPlainText(item.title)}`}
            className="flex flex-col items-center gap-4 px-6 py-8 text-center @md:px-8 @md:py-10"
          >
            {iconElement}
            <div className="flex flex-col items-center gap-1.5">
              {item.eyebrow ? (
                <span className="font-heading text-[0.7rem] italic tracking-[0.08em] text-accent/70">
                  {item.eyebrow}
                </span>
              ) : null}
              {item.title.length > 0 ? (
                <span className="text-sm tracking-[0.02em] text-foreground">
                  <PortableTextSpans spans={item.title} />
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  const visibilityClass = cn(
    config.layout.hideOnMobile && "max-md:hidden",
    config.layout.hideOnDesktop && "md:hidden",
  );

  return (
    <section
      className={cn("@container border-y border-border", visibilityClass)}
    >
      {animate === "none" ? (
        grid
      ) : (
        <ScrollReveal variant={animate}>{grid}</ScrollReveal>
      )}
    </section>
  );
}
