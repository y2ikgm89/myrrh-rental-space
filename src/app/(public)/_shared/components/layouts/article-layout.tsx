import type { ReactElement, ReactNode } from "react";
import { Container } from "../design-system/container";
import { Breadcrumb } from "./breadcrumb";
import { BlogLayout } from "./blog-layout";
import { SiteCTA } from "./site-cta";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import type { LayoutWidth } from "@/shared/types/prisma";
import { cn } from "@/shared/lib/cn";

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface ArticleLayoutProps {
  readonly children: ReactNode;
  /** JSON-LD nodes injected at the top of the document fragment. */
  readonly jsonLd?: ReactNode;
  /** Banner shown above the breadcrumb (e.g., preview mode notice). */
  readonly banner?: ReactNode;
  /** When provided, renders a `bg-surface` breadcrumb band. */
  readonly breadcrumb?: ReadonlyArray<BreadcrumbItem>;
  /** `null` = follow global sidebar settings. `true`/`false` = explicit override. */
  readonly showSidebar?: boolean | null;
  /** Article body width preset. Omitted = fluid width (no max-width). */
  readonly contentWidth?: LayoutWidth;
  readonly contentWidthCustom?: number | null;
  /** Append `<SiteCTA />` after the article (default `true`). */
  readonly showCta?: boolean;
}

/**
 * ArticleLayout — 公開記事詳細ページ共通レイアウト
 *
 * posts / news / preview 詳細ページの単一エントリポイント。
 * Breadcrumb 帯 → semantic `<article>` → optional sidebar → optional CTA。
 *
 * 階層は最小化されており、Container と article が直接ネストする
 * （contentClassName 重複ラッパー廃止、BlogLayout は sidebar 有効時のみ
 * grid wrapper を生成する）。
 */
export function ArticleLayout({
  children,
  jsonLd,
  banner,
  breadcrumb,
  showSidebar = null,
  contentWidth,
  contentWidthCustom = null,
  showCta = true,
}: ArticleLayoutProps): ReactElement {
  const widthStyles = contentWidth
    ? resolveWidthStyles({ width: contentWidth, customPx: contentWidthCustom })
    : null;

  const article = (
    <article
      className={cn(widthStyles?.className)}
      {...(widthStyles?.style && { style: widthStyles.style })}
    >
      {children}
    </article>
  );

  return (
    <>
      {jsonLd}
      {banner}
      {breadcrumb && breadcrumb.length > 0 ? (
        <div className="bg-surface py-2 shadow-inner">
          <Container>
            <Breadcrumb items={breadcrumb} size="sm" />
          </Container>
        </div>
      ) : null}
      <Container className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <BlogLayout showSidebar={showSidebar}>{article}</BlogLayout>
      </Container>
      {showCta ? <SiteCTA /> : null}
    </>
  );
}
