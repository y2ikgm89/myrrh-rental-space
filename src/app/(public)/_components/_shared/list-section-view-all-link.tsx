"use client";

/**
 * ListSectionViewAllLink — list セクション共通の「すべて見る」リンク
 *
 * news-list / post-list / space-list / faq-list が同一形状で持っていた
 * `config.showViewAllLink && config.viewAllText.length > 0` の Link + PortableTextSpans
 * ブロックを集約する。
 *
 * 表示条件 (showViewAllLink && viewAllText.length > 0) も内部で判定するため、
 * 呼び出し側は config を渡すだけで良い。条件不成立時は null を返す。
 *
 * 親要素側で `<ScrollReveal>` のラップ等は行わない — 既存実装と揃えるため、
 * 本コンポーネントが内部で ScrollReveal + 中央寄せ margin を提供する。
 */

import Link from "next/link";
import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { toAppRoute } from "@/shared/lib/typed-routes";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

interface ListSectionViewAllLinkProps {
  readonly config: {
    readonly showViewAllLink: boolean;
    readonly viewAllText: PortableTextSpan[];
    readonly viewAllUrl: string;
  };
  /**
   * 上方向の margin クラス。
   * news-list / faq-list は `mt-8`、post-list / space-list は `mt-10` を使う。
   */
  readonly marginTopClassName?: string;
}

export function ListSectionViewAllLink({
  config,
  marginTopClassName = "mt-8",
}: ListSectionViewAllLinkProps): ReactElement | null {
  if (!config.showViewAllLink || config.viewAllText.length === 0) return null;

  return (
    <ScrollReveal delay={0.2}>
      <div className={`${marginTopClassName} text-center`}>
        <Link
          href={toAppRoute(config.viewAllUrl)}
          className="group relative inline-block text-xs uppercase tracking-eyebrow text-muted-foreground transition-colors hover:text-foreground"
        >
          <PortableTextSpans spans={config.viewAllText} />
          <span aria-hidden="true">{" →"}</span>
          <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
        </Link>
      </div>
    </ScrollReveal>
  );
}
