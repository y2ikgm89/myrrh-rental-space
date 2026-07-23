"use client";

import { useQueryStates } from "nuqs";
import { adminEventCategorySearchParamsParsers } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";
import { Checkbox, Label, Input } from "@/admin/components/ui";

export function CategoryFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(
    adminEventCategorySearchParamsParsers,
    {
      history: "replace",
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

      <div className="flex-1">
        <Input
          type="search"
          placeholder="名前・説明で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
    </div>
  );
}
