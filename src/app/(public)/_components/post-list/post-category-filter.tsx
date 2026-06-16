import type { ReactElement } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { buildCategoryPath } from "@/shared/domain/posts/routing";

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface PostCategoryFilterProps {
  readonly categories: readonly CategoryOption[];
  /**
   * 現在表示中のカテゴリ slug（`/category/{slug}` ページ）。
   * 一覧（`/blog`）では未指定で "All" が active になる。
   */
  readonly activeSlug?: string;
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center px-5 py-2 text-eyebrow uppercase transition-all duration-300";
const CHIP_ACTIVE = "bg-accent text-accent-foreground";
const CHIP_INACTIVE =
  "border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30";

/**
 * カテゴリ絞り込みナビ（パスベース）。
 *
 * 各カテゴリは `/category/{slug}` への Link。絞り込みは URL パスで表現するため
 * client state（旧 nuqs `?category=`）は持たない server component。
 */
export function PostCategoryFilter({
  categories,
  activeSlug,
}: PostCategoryFilterProps): ReactElement {
  return (
    <nav aria-label="カテゴリフィルタ" className="mb-8">
      <ul className="flex flex-wrap gap-3" role="list">
        <li>
          <Link
            href="/blog"
            aria-current={activeSlug ? undefined : "page"}
            className={cn(CHIP_BASE, activeSlug ? CHIP_INACTIVE : CHIP_ACTIVE)}
          >
            All
          </Link>
        </li>
        {categories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={toAppRoute(buildCategoryPath(cat.slug))}
              aria-current={activeSlug === cat.slug ? "page" : undefined}
              className={cn(
                CHIP_BASE,
                activeSlug === cat.slug ? CHIP_ACTIVE : CHIP_INACTIVE,
              )}
            >
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
