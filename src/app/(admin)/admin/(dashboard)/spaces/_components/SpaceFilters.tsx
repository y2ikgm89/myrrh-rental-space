"use client";

import { useEffect, useRef } from "react";
import { useQueryStates } from "nuqs";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED } from "@/shared/lib/constants/admin-space-management";
import type { AdminSpaceListSortBy } from "@/shared/lib/constants/admin-space-management";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

const PUBLISH_STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: PUBLISH_LABELS.published },
  { value: "false", label: PUBLISH_LABELS.unpublished },
] as const;

type SortOrder = "asc" | "desc";

type SortOption = {
  value: string;
  label: string;
  sortBy: AdminSpaceListSortBy;
  sortOrder: SortOrder;
};

const SORT_OPTIONS: SortOption[] = [
  {
    value: "createdAt:desc",
    label: "作成日（新しい順）",
    sortBy: "createdAt",
    sortOrder: "desc",
  },
  {
    value: "createdAt:asc",
    label: "作成日（古い順）",
    sortBy: "createdAt",
    sortOrder: "asc",
  },
  {
    value: "updatedAt:desc",
    label: "更新日（新しい順）",
    sortBy: "updatedAt",
    sortOrder: "desc",
  },
  {
    value: "updatedAt:asc",
    label: "更新日（古い順）",
    sortBy: "updatedAt",
    sortOrder: "asc",
  },
  {
    value: "name:asc",
    label: "名前（昇順）",
    sortBy: "name",
    sortOrder: "asc",
  },
  {
    value: "name:desc",
    label: "名前（降順）",
    sortBy: "name",
    sortOrder: "desc",
  },
  {
    value: "hourlyPrice:asc",
    label: "料金（安い順）",
    sortBy: "hourlyPrice",
    sortOrder: "asc",
  },
  {
    value: "hourlyPrice:desc",
    label: "料金（高い順）",
    sortBy: "hourlyPrice",
    sortOrder: "desc",
  },
];

export type SpaceFilterSelectOption = { id: string; name: string };

type SpaceFiltersProps = {
  locationOptions: SpaceFilterSelectOption[];
  categoryOptions: SpaceFilterSelectOption[];
};

/**
 * スペース一覧タブ専用。URL キーは `adminSpaceSearchParamsCache` の `sp*` と一致させる。
 */
export function SpaceFilters({
  locationOptions,
  categoryOptions,
}: SpaceFiltersProps) {
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
      void setParams({ spSearch: value || null, spPage: 1 });
    }, 300);
  };

  const setStatus = (value: string) => {
    const statusValue = value === "ALL" ? null : value || null;
    void setParams({ spStatus: statusValue, spPage: 1 });
  };

  const setLocationFilter = (value: string) => {
    const next = value === "ALL" ? null : value;
    void setParams({ spLocationId: next, spPage: 1 });
  };

  const setCategoryFilter = (value: string) => {
    const next = value === "ALL" ? null : value;
    void setParams({ spCategoryId: next, spPage: 1 });
  };

  const setSort = (value: string) => {
    const option = SORT_OPTIONS.find((opt) => opt.value === value);
    if (!option) return;
    void setParams({
      spSortBy: option.sortBy,
      spSortOrder: option.sortOrder,
      spPage: 1,
    });
  };

  const currentStatus = params.spStatus || "ALL";
  const currentLocation = params.spLocationId || "ALL";
  const currentCategory = params.spCategoryId || "ALL";
  const currentSort = `${params.spSortBy}:${params.spSortOrder}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Select value={currentStatus} onValueChange={setStatus}>
          <SelectTrigger aria-label="公開状態で絞り込み">
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

        <Select value={currentLocation} onValueChange={setLocationFilter}>
          <SelectTrigger aria-label="拠点で絞り込み">
            <SelectValue placeholder="拠点" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべての拠点</SelectItem>
            {locationOptions.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentCategory} onValueChange={setCategoryFilter}>
          <SelectTrigger aria-label="カテゴリで絞り込み">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべてのカテゴリ</SelectItem>
            <SelectItem value={ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED}>
              未分類のみ
            </SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentSort} onValueChange={setSort}>
          <SelectTrigger aria-label="並び替え">
            <SelectValue placeholder="並び替え" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1">
        <Input
          type="search"
          placeholder="名前・住所・説明で検索..."
          defaultValue={params.spSearch}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
    </div>
  );
}
