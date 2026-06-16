"use client";

import type { ReactElement } from "react";
import { SearchBar } from "@/public/components/ui/search-bar";

export function SidebarSearch(): ReactElement {
  return (
    <div>
      <h2 className="mb-4 text-eyebrow uppercase text-muted-foreground">
        Search
      </h2>
      <SearchBar placeholder="記事を検索..." />
    </div>
  );
}
