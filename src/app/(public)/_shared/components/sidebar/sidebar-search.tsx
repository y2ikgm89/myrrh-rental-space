"use client";

import type { ReactElement } from "react";
import { SearchBar } from "@/public/components/ui/search-bar";

export function SidebarSearch(): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Search
      </h3>
      <SearchBar placeholder="記事を検索..." />
    </div>
  );
}
