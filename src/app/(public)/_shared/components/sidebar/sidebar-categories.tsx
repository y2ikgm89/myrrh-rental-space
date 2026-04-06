import type { ReactElement } from "react";
import Link from "next/link";
import type { SidebarCategoryItem } from "@/shared/domain/sidebar/queries";

interface SidebarCategoriesProps {
  categories: readonly SidebarCategoryItem[];
}

export function SidebarCategories({
  categories,
}: SidebarCategoriesProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Categories
      </h3>
      <ul className="space-y-3">
        {categories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={`/journal?tab=posts&category=${cat.slug}`}
              className="flex items-center justify-between text-sm transition-colors hover:text-foreground"
            >
              <span>{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {cat.postCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
