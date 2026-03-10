"use client";

/**
 * Taxonomy (カテゴリー・タグ) フィルター用hooks
 *
 * @description nuqs を使用した型安全な URL パラメータ管理
 */

import { useQueryStates, parseAsString } from "nuqs";
import { parseAsBoolean } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";

// =============================================================================
// Types
// =============================================================================

export type TaxonomySortField = "name" | "postCount" | "createdAt";
export type SortOrder = "asc" | "desc";

// Type guards (Set-based pattern)
const SORT_FIELD_VALUES = ["name", "postCount", "createdAt"] as const;
const SORT_FIELD_SET = new Set<string>(SORT_FIELD_VALUES);

const SORT_ORDER_VALUES = ["asc", "desc"] as const;
const SORT_ORDER_SET = new Set<string>(SORT_ORDER_VALUES);

function isSortField(value: unknown): value is TaxonomySortField {
  return typeof value === "string" && SORT_FIELD_SET.has(value);
}

function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === "string" && SORT_ORDER_SET.has(value);
}

function parseSortField(value: unknown): TaxonomySortField {
  return isSortField(value) ? value : "name";
}

function parseSortOrder(value: unknown): SortOrder {
  return isSortOrder(value) ? value : "asc";
}

export type CategoryFilterParams = {
  search: string;
};

export type TagFilterParams = {
  search: string;
  sortBy: TaxonomySortField;
  sortOrder: SortOrder;
  unusedOnly: boolean;
};

// =============================================================================
// Debounce Hook
// =============================================================================

function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number,
): (value: string) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (value: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(value);
    }, delayMs);
  };
}

// =============================================================================
// カテゴリーフィルターhook
// =============================================================================

export function useCategoryFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      tab: parseAsString.withDefault("categories"),
    },
    {
      history: "push",
      shallow: false,
    },
  );

  const setSearch = (value: string) => {
    void setParams({ search: value || null });
  };

  const setSearchDebounced = useDebouncedCallback(setSearch, 300);

  const reset = () => {
    void setParams({ search: null });
  };

  return {
    params: {
      search: params.search,
    },
    setSearch,
    setSearchDebounced,
    reset,
  };
}

// =============================================================================
// タグフィルターhook
// =============================================================================

export function useTagFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      sortBy: parseAsString.withDefault("name"),
      sortOrder: parseAsString.withDefault("asc"),
      unusedOnly: parseAsBoolean.withDefault(false),
      tab: parseAsString.withDefault("tags"),
    },
    {
      history: "push",
      shallow: false,
    },
  );

  const setSearch = (value: string) => {
    void setParams({ search: value || null });
  };

  const setSearchDebounced = useDebouncedCallback(setSearch, 300);

  const toggleSort = (field: TaxonomySortField) => {
    if (params.sortBy === field) {
      void setParams({
        sortOrder: params.sortOrder === "asc" ? "desc" : "asc",
      });
    } else {
      void setParams({ sortBy: field, sortOrder: "asc" });
    }
  };

  const setUnusedOnly = (value: boolean) => {
    void setParams({ unusedOnly: value || null });
  };

  const reset = () => {
    void setParams({
      search: null,
      sortBy: null,
      sortOrder: null,
      unusedOnly: null,
    });
  };

  return {
    params: {
      search: params.search,
      sortBy: parseSortField(params.sortBy),
      sortOrder: parseSortOrder(params.sortOrder),
      unusedOnly: params.unusedOnly,
    },
    setSearch,
    setSearchDebounced,
    toggleSort,
    setUnusedOnly,
    reset,
  };
}
