"use client";

import type { ReactElement } from "react";
import { parseAsString, parseAsInteger, useQueryStates } from "nuqs";
import { IconSearch } from "@tabler/icons-react";

interface SearchBarProps {
  readonly placeholder?: string;
}

const searchParsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export function SearchBar({
  placeholder = "検索...",
}: SearchBarProps): ReactElement {
  const [params, setParams] = useQueryStates(searchParsers, {
    history: "push",
    shallow: false,
  });

  function handleChange(value: string) {
    void setParams({ q: value || null, page: 1 });
  }

  return (
    <div className="relative">
      <IconSearch
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={params.q}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={placeholder}
      />
    </div>
  );
}
