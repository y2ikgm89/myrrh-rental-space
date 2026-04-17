"use client";

import { IconSearch } from "@tabler/icons-react";
import { useQueryStates } from "nuqs";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

const PUBLISH_STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: PUBLISH_LABELS.published },
  { value: "false", label: PUBLISH_LABELS.unpublished },
];

export function LocationFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(adminSpaceSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

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
      void setParams({ locSearch: value || null, locPage: 1 });
    }, 300);
  };

  const setPublished = (value: string) => {
    const publishedValue = value === "ALL" ? null : value || null;
    void setParams({ locPublished: publishedValue, locPage: 1 });
  };

  const currentPublished = params.locPublished || "ALL";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* 公開状態フィルター */}
      <div className="w-full sm:w-48">
        <Select value={currentPublished} onValueChange={setPublished}>
          <SelectTrigger>
            <SelectValue placeholder="公開状態" />
          </SelectTrigger>
          <SelectContent>
            {PUBLISH_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="名前・住所で検索..."
          defaultValue={params.locSearch}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
