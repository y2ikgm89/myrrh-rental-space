"use client";

import { Search } from "lucide-react";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { parseAsBoolean } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";
import { Checkbox, Label, Input } from "@/admin/components/ui";

export function CategoryFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      includeInactive: parseAsBoolean.withDefault(false),
      page: parseAsInteger.withDefault(1),
      tab: parseAsString.withDefault("categories"),
    },
    {
      history: "push",
      shallow: false,
    },
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const setSearchDebounced = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      void setParams({ search: value || null, page: 1 });
    }, 300);
  };

  const handleIncludeInactiveChange = (checked: boolean) => {
    void setParams({ includeInactive: checked || null, page: 1 });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* 非アクティブを含める */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="includeInactive"
          checked={params.includeInactive}
          onCheckedChange={handleIncludeInactiveChange}
        />
        <Label htmlFor="includeInactive" className="text-sm cursor-pointer">
          非アクティブを含める
        </Label>
      </div>

      {/* 検索 */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="名前・説明で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
