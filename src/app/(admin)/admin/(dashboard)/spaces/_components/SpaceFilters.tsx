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
import {
  ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED,
  ADMIN_SPACE_LIST_SORT_BY,
} from "@/shared/lib/constants/admin-space-management";
import type { AdminSpaceListSortBy } from "@/shared/lib/constants/admin-space-management";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

const PUBLISH_STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: PUBLISH_LABELS.published },
  { value: "false", label: PUBLISH_LABELS.unpublished },
] as const;

const SORT_OPTIONS: { value: AdminSpaceListSortBy; label: string }[] = [
  { value: "createdAt", label: "作成日" },
  { value: "updatedAt", label: "更新日" },
  { value: "name", label: "名前" },
  { value: "hourlyPrice", label: "時間料金" },
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

  const setSortBy = (value: string) => {
    const parsed = ADMIN_SPACE_LIST_SORT_BY.find((v) => v === value);
    if (!parsed) return;
    void setParams({ spSortBy: parsed, spPage: 1 });
  };

  const setSortOrder = (value: string) => {
    if (value !== "asc" && value !== "desc") return;
    void setParams({ spSortOrder: value, spPage: 1 });
  };

  const currentStatus = params.spStatus || "ALL";
  const currentLocation = params.spLocationId || "ALL";
  const currentCategory = params.spCategoryId || "ALL";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center">
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:w-auto xl:flex-1 xl:gap-3">
          <div className="w-full sm:min-w-40 lg:max-w-xs">
            <Select value={currentStatus} onValueChange={setStatus}>
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

          <div className="w-full sm:min-w-40 lg:max-w-xs">
            <Select value={currentLocation} onValueChange={setLocationFilter}>
              <SelectTrigger>
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
          </div>

          <div className="w-full sm:min-w-40 lg:max-w-xs">
            <Select value={currentCategory} onValueChange={setCategoryFilter}>
              <SelectTrigger>
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
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center xl:w-auto">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0 text-xs text-muted-foreground sm:w-10">
              並び
            </span>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-1">
              <Select value={params.spSortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="項目" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={params.spSortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="順序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">降順</SelectItem>
                  <SelectItem value="asc">昇順</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
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
