"use client";

/**
 * Taxonomy (カテゴリー・タグ) フィルター用 hooks
 *
 * @description nuqs — パーサーは `@/shared/lib/nuqs` の単一ソース定義と一致させる
 */

import { useQueryStates } from "nuqs";
import { useRef, useEffect } from "react";
import {
  postTaxonomyCategorySearchParamsParsers,
  postTaxonomyTagSearchParamsParsers,
  type PostTaxonomySortField,
} from "@/shared/lib/nuqs";

export type { PostTaxonomySortField };
export type SortOrder = "asc" | "desc";

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

export type CategoryFilterParams = {
  search: string;
};

export type TagFilterParams = {
  search: string;
  sortBy: PostTaxonomySortField;
  sortOrder: SortOrder;
  unusedOnly: boolean;
};

export function useCategoryFilters() {
  // 検索は純クライアント処理（CategoryManager が全件 props を .filter()）。
  // サーバ getPostCategories() は無引数・全件返却で search を honor しないため、
  // shallow:false は同一全件の無駄な RSC 再取得を招く → shallow:true。
  // history は #629 の方針（フィルタ=push 維持）に従う。
  const [params, setParams] = useQueryStates(
    postTaxonomyCategorySearchParamsParsers,
    {
      history: "push",
      shallow: true,
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

export function useTagFilters() {
  // 検索/ソート/未使用フィルタは純クライアント処理（TagManager が全件 props を
  // .filter()/.sort()）。サーバ getPostTags() は無引数・全件返却で filter/sort を
  // honor しないため、shallow:false は同一全件の無駄な RSC 再取得を招く → shallow:true。
  // history は #629 の方針（フィルタ=push 維持）に従う。
  const [params, setParams] = useQueryStates(
    postTaxonomyTagSearchParamsParsers,
    {
      history: "push",
      shallow: true,
    },
  );

  const setSearch = (value: string) => {
    void setParams({ search: value || null });
  };

  const setSearchDebounced = useDebouncedCallback(setSearch, 300);

  const toggleSort = (field: PostTaxonomySortField) => {
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
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      unusedOnly: params.unusedOnly,
    },
    setSearch,
    setSearchDebounced,
    toggleSort,
    setUnusedOnly,
    reset,
  };
}
