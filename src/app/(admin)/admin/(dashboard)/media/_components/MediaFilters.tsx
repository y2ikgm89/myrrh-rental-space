"use client";

/**
 * メディアフィルター
 */

import { useEffect, useRef, useState } from "react";
import { useQueryStates } from "nuqs";
import { adminMediaSearchParamsParsers } from "@/shared/lib/nuqs";
import { Search, Grid, List, Upload } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/admin/components/ui";
import { MediaUploadDialog } from "./MediaUploadDialog";
import { TYPE_OPTIONS, USAGE_FILTER_OPTIONS } from "./constants";

export function MediaFilters() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(adminMediaSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      void setParams({ search: value || null, page: 1 });
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Left: Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="検索..."
              defaultValue={params.search}
              onChange={handleSearchChange}
              className="w-48 pl-9"
            />
          </div>

          {/* Type Filter */}
          <Select
            value={params.type || "all"}
            onValueChange={(v) =>
              void setParams({ type: v === "all" ? null : v, page: 1 })
            }
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              {TYPE_OPTIONS.filter((opt) => opt.value !== "").map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Usage Filter */}
          <Select
            value={params.usage || "all"}
            onValueChange={(v) =>
              void setParams({ usage: v === "all" ? null : v, page: 1 })
            }
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての用途</SelectItem>
              {USAGE_FILTER_OPTIONS.filter((opt) => opt.value !== "").map(
                (opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Right: View Toggle & Upload */}
        <div className="flex gap-2 items-center">
          {/* View Toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => void setParams({ view: "grid" })}
              className={`p-2 ${
                params.view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              aria-label="グリッド表示"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void setParams({ view: "list" })}
              className={`p-2 ${
                params.view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              aria-label="リスト表示"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Upload Button */}
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            アップロード
          </Button>
        </div>
      </div>

      <MediaUploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </>
  );
}
