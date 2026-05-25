import type { ReactElement, ReactNode } from "react";
import { Container } from "../design-system/container";
import { Breadcrumb } from "./breadcrumb";
import { BlogLayout } from "./blog-layout";
import { SiteCTA } from "./site-cta";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import type { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
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
  /**
   * Full-width hero block within `<article>` (eyebrow + h1 + hairline + meta + media)。
   * `toc` / sidebar の 2-col grid 開始前に配置されるため、gallery / thumbnail が
   * 横の sticky widget に圧迫されない。Airbnb / Booking.com / Eventbrite / Notion
   * 業界標準パターン (hero full-width → 本文 2-col)。
   */
  readonly hero?: ReactNode;
  /**
   * Component-level explicit disable (`false`)。未指定時は global sidebar settings
   * (`Settings.sidebarEnabled`) に従う。
   * `toc` が渡されたときは BlogLayout を経由せず独自 2 カラムを組むため
   * この値は無視される（TOC サイドバーが sidebar slot を占有する）。
   */
  readonly showSidebar?: boolean;
  /** Article body width preset. Omitted = fluid width (no max-width). */
  readonly contentWidth?: LayoutWidth;
  readonly contentWidthCustom?: number | null;
  /** Append `<SiteCTA />` after the article (default `true`). */
  readonly showCta?: boolean;
  /**
   * Desktop sidebar (`lg+`) に配置する目次などの補助ナビゲーション。
   * 指定されると BlogLayout の widget サイドバーを置き換える 2 カラム grid を組む。
   */
  readonly toc?: ReactNode;
  /**
   * 本文冒頭（`<article>` 内の hero 下、body の最上部）に挿入されるコンテンツ。
   * モバイル用 `<details>` 折りたたみ目次や予約 widget の inline 表示に使う
   * (sidebar は `<lg` で末尾スタックされるため、モバイルでは冒頭配置が定石)。
   * `toc` が desktop 側に置かれていても mobile 表示用は別途ここで渡す。
   */
  readonly mobileToc?: ReactNode;
}

/**
 * ArticleLayout — 公開記事 / リソース詳細ページ共通レイアウト
 *
 * Breadcrumb 帯 → semantic `<article>` (full-width hero → body grid) → optional CTA。
 *
 * Body grid:
 *   - `toc` あり: 独自 2 カラム (`lg:grid-cols-[1fr_280px]`)
 *   - `toc` なし: `BlogLayout` (widget サイドバー)
 *
 * Hero は body grid の **外** (`<article>` 内 full-width) に配置されるため、
 * gallery / thumbnail が右の sticky widget で圧迫されない (Airbnb / Eventbrite /
 * Notion 業界標準パターン)。
 */
export function ArticleLayout({
  children,
  jsonLd,
  banner,
  breadcrumb,
  hero,
  showSidebar,
  contentWidth,
  contentWidthCustom = null,
  showCta = true,
  toc,
  mobileToc,
}: ArticleLayoutProps): ReactElement {
  const widthStyles = contentWidth
    ? resolveWidthStyles({ width: contentWidth, customPx: contentWidthCustom })
    : null;

  const body = (
    <div
      className={cn("min-w-0", widthStyles?.className)}
      {...(widthStyles?.style && { style: widthStyles.style })}
    >
      {mobileToc ? <div className="lg:hidden">{mobileToc}</div> : null}
      {children}
    </div>
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
      <Container className="pt-10 pb-[var(--space-lg)] md:pt-14">
        <article>
          {hero ? <div className="mb-12">{hero}</div> : null}
          {toc ? (
            <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-16">
              {body}
              <aside className="hidden lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:block lg:self-start">
                {toc}
              </aside>
            </div>
          ) : (
            <BlogLayout {...(showSidebar !== undefined && { showSidebar })}>
              {body}
            </BlogLayout>
          )}
        </article>
      </Container>
      {showCta ? <SiteCTA /> : null}
    </>
  );
}
