"use client";

import { useTransition } from "react";
import { useQueryStates } from "nuqs";
import { IconSearch, IconX } from "@tabler/icons-react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from "@/admin/components/ui";
import { adminFaqSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import { FaqQuickFilterChips } from "./FaqQuickFilterChips";

type FaqItemFiltersProps = {
  readonly categories: readonly { id: string; name: string }[];
};

const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "published", label: "公開中" },
  { value: "draft", label: "下書き" },
] as const;

const ALL_CATEGORIES_VALUE = "__all__";

export function FaqItemFilters({ categories }: FaqItemFiltersProps) {
  const [, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(adminFaqSearchParamsParsers, {
    history: "push",
    shallow: false,
    startTransition,
  });

  const setSearchDebounced = useDebouncedCallback((value: string) => {
    void setParams({ search: value || null, page: 1 });
  }, 300);

  const handleCategoryChange = (value: string) => {
    void setParams({
      categoryId: value === ALL_CATEGORIES_VALUE ? null : value,
      page: 1,
    });
  };

  const handleStatusChange = (value: string) => {
    if (value === "all" || value === "published" || value === "draft") {
      void setParams({ status: value, page: 1 });
    }
  };

  const handleReset = () => {
    void setParams({
      search: null,
      categoryId: null,
      status: null,
      quickFilter: null,
      page: null,
    });
  };

  const hasFilters =
    params.search !== "" ||
    params.categoryId !== "" ||
    params.status !== "all" ||
    params.quickFilter !== "all";

  return (
    <div className="space-y-3">
      <FaqQuickFilterChips />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-56">
          <Select
            value={params.categoryId || ALL_CATEGORIES_VALUE}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger aria-label="カテゴリで絞り込み">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES_VALUE}>
                すべてのカテゴリ
              </SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40">
          <Select value={params.status} onValueChange={handleStatusChange}>
            <SelectTrigger aria-label="公開ステータスで絞り込み">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1">
          <IconSearch
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="質問・回答で検索..."
            defaultValue={params.search}
            onChange={(e) => setSearchDebounced(e.target.value)}
            className="pl-9"
            aria-label="FAQ項目を検索"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <IconX className="mr-1 h-4 w-4" aria-hidden="true" />
            リセット
          </Button>
        )}
      </div>
    </div>
  );
}
