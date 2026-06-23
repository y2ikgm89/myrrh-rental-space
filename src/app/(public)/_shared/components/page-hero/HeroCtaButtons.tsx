/**
 * HeroCtaButtons — page-hero 全 variant 共通の CTA ボタンクラスタ
 *
 * SSoT/DRY 改善: EditorialSplit / Compact / Media の 3 variant で同一の
 * `grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm` レイアウトを
 * ばらして書いていたものを 1 箇所に集約する。
 *
 * **再 litigate 禁止**: PR #703 (`project_hero-cta-grid-equal-width`) で確定した
 * 「CTA は grid grid-cols-1 sm:grid-cols-2 max-w-sm で完全等幅」契約を
 * このコンポーネント内部で固定する。pure CSS で broadest-sibling-fit は不可能で
 * grid 等分が canonical。min-w / flex-1 / subgrid は全否決済。
 *
 * 各 variant 固有の周辺レイアウト (mx-auto / mt-* / md:mt-* など) は
 * 呼び出し側で wrapper class として渡す。
 */

import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { cn } from "@/shared/lib/cn";
import { isAppRoute } from "@/shared/lib/typed-routes";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

export interface HeroCtaButton {
  readonly label: PortableTextSpan[];
  readonly url: string;
  readonly openInNewTab: boolean;
}

interface HeroCtaButtonsProps {
  readonly buttons: readonly HeroCtaButton[];
  /** ラッパー grid に追加する class (mx-auto / sm:mx-0 など)。 */
  readonly className?: string;
}

export function HeroCtaButtons({
  buttons,
  className,
}: HeroCtaButtonsProps): ReactElement | null {
  if (buttons.length === 0) return null;

  return (
    <div
      className={cn(
        // PR #703 SSoT: 等幅 grid (max-w-sm) — 再 litigate 禁止
        "grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4",
        className,
      )}
    >
      {buttons.map((btn) => (
        <Button
          key={btn.url}
          variant="editorial"
          href={isAppRoute(btn.url) ? btn.url : "/reservation"}
          className="min-h-[var(--touch-target-min)] w-full justify-center text-xs uppercase tracking-eyebrow"
          {...(btn.openInNewTab && { target: "_blank" as const })}
          label={btn.label}
        />
      ))}
    </div>
  );
}
