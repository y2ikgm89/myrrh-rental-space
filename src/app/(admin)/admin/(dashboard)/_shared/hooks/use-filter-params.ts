/**
 * nuqs ベースのフィルターパラメータhooks
 *
 * @description 管理画面のフィルター機能で共通使用するhooks
 * @see https://nuqs.dev/docs/hooks
 */

"use client";

import { useQueryStates, parseAsInteger, parseAsString } from "nuqs";
import { adminCustomerSearchParamsParsers } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";

// ============================================================
// Types
// ============================================================

export type FilterParams = {
  search: string;
  status: string;
  page: number;
  perPage: number;
};

export type FilterParamsWithCategory = FilterParams & {
  categoryId: string;
};

export type UseFilterParamsOptions = {
  /** デバウンス時間（ミリ秒） */
  debounceMs?: number;
  /** デフォルトのステータス値 */
  defaultStatus?: string;
  /** デフォルトの1ページあたりの件数 */
  defaultPerPage?: number;
  /** カテゴリフィルターを含めるか */
  withCategory?: boolean;
};

// ============================================================
// Internal: Debounce Hook
// ============================================================

export function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number,
): (value: string) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Ref を effect 内で更新（レンダー中の更新は禁止）
  // 依存配列なし: 毎レンダー後に最新の callback を ref に保持するため意図的
  useEffect(() => {
    callbackRef.current = callback;
  });

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
      callbackRef.current(value);
    }, delayMs);
  };
}

// ============================================================
// Return Types
// ============================================================

type BaseFilterReturn = {
  params: FilterParams;
  setSearch: (value: string) => void;
  setSearchDebounced: (value: string) => void;
  setStatus: (value: string) => void;
  setPage: (value: number) => void;
  setPerPage: (value: number) => void;
  reset: () => void;
};

type CategoryFilterReturn = {
  params: FilterParamsWithCategory;
  setSearch: (value: string) => void;
  setSearchDebounced: (value: string) => void;
  setStatus: (value: string) => void;
  setCategory: (value: string) => void;
  setPage: (value: number) => void;
  setPerPage: (value: number) => void;
  reset: () => void;
};

// ============================================================
// Hooks
// ============================================================

// ============================================================
// Internal: Base Filter Implementation
// ============================================================

function useBaseFilterParams(options: {
  debounceMs: number;
  defaultStatus: string;
  defaultPerPage: number;
}): BaseFilterReturn {
  const { debounceMs, defaultStatus, defaultPerPage } = options;

  // history: replace は nuqs 公式デフォルト（push はタブ/モーダル等ナビ風UI専用）。
  // shallow:false でサーバ（RSC）に絞り込み結果を再取得させる。
  const [params, setParams] = useQueryStates(
    {
      ...adminCustomerSearchParamsParsers,
      status: parseAsString.withDefault(defaultStatus),
      perPage: parseAsInteger.withDefault(defaultPerPage),
    },
    { history: "replace", shallow: false },
  );

  const setSearch = (value: string) => {
    void setParams({ search: value || null, page: 1 });
  };

  const setSearchDebounced = useDebouncedCallback(setSearch, debounceMs);

  const setStatus = (value: string) => {
    const statusValue = value === "ALL" ? null : value || null;
    void setParams({ status: statusValue, page: 1 });
  };

  const setPage = (value: number) => {
    void setParams({ page: value });
  };

  const setPerPage = (value: number) => {
    void setParams({ perPage: value, page: 1 });
  };

  const reset = () => {
    void setParams({
      search: null,
      status: null,
      page: 1,
      perPage: defaultPerPage,
    });
  };

  return {
    params: {
      ...params,
      status: params.status || "ALL",
    },
    setSearch,
    setSearchDebounced,
    setStatus,
    setPage,
    setPerPage,
    reset,
  };
}

// ============================================================
// Internal: Category Filter Implementation
// ============================================================

function useCategoryFilterParams(options: {
  debounceMs: number;
  defaultStatus: string;
  defaultPerPage: number;
}): CategoryFilterReturn {
  const { debounceMs, defaultStatus, defaultPerPage } = options;

  // history: replace は nuqs 公式デフォルト（push はタブ/モーダル等ナビ風UI専用）。
  // shallow:false でサーバ（RSC）に絞り込み結果を再取得させる。
  const [params, setParams] = useQueryStates(
    {
      ...adminCustomerSearchParamsParsers,
      status: parseAsString.withDefault(defaultStatus),
      perPage: parseAsInteger.withDefault(defaultPerPage),
      categoryId: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: false },
  );

  const setSearch = (value: string) => {
    void setParams({ search: value || null, page: 1 });
  };

  const setSearchDebounced = useDebouncedCallback(setSearch, debounceMs);

  const setStatus = (value: string) => {
    const statusValue = value === "ALL" ? null : value || null;
    void setParams({ status: statusValue, page: 1 });
  };

  const setCategory = (value: string) => {
    const categoryValue = value === "ALL" ? null : value || null;
    void setParams({ categoryId: categoryValue, page: 1 });
  };

  const setPage = (value: number) => {
    void setParams({ page: value });
  };

  const setPerPage = (value: number) => {
    void setParams({ perPage: value, page: 1 });
  };

  const reset = () => {
    void setParams({
      search: null,
      status: null,
      page: 1,
      perPage: defaultPerPage,
      categoryId: null,
    });
  };

  return {
    params: {
      ...params,
      status: params.status || "ALL",
      categoryId: params.categoryId || "ALL",
    },
    setSearch,
    setSearchDebounced,
    setStatus,
    setCategory,
    setPage,
    setPerPage,
    reset,
  };
}

// ============================================================
// Public: Filter Params Hooks
// ============================================================

type BaseFilterOptions = Omit<UseFilterParamsOptions, "withCategory">;

/**
 * 基本フィルターパラメータhooks（カテゴリなし）
 *
 * @example
 * const { params, setSearch, setStatus, setPage } = useFilterParams()
 */
export function useFilterParams(
  options: BaseFilterOptions = {},
): BaseFilterReturn {
  const { debounceMs = 300, defaultStatus = "", defaultPerPage = 10 } = options;

  return useBaseFilterParams({ debounceMs, defaultStatus, defaultPerPage });
}

/**
 * カテゴリ付きフィルターパラメータhooks
 *
 * @example
 * const { params, setCategory } = useFilterParamsWithCategory()
 */
export function useFilterParamsWithCategory(
  options: BaseFilterOptions = {},
): CategoryFilterReturn {
  const { debounceMs = 300, defaultStatus = "", defaultPerPage = 10 } = options;

  return useCategoryFilterParams({ debounceMs, defaultStatus, defaultPerPage });
}
