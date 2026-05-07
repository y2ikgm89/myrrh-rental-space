"use client";

/**
 * FaqCategoryItemsFilters
 *
 * /admin/faq/[categoryId] 詳細ページの質問検索・ステータスフィルタ。
 * カテゴリは親ルーティングで固定されているためフィルタ対象外。
 */

import { useTransition } from "react";
import { useQueryStates } from "nuqs";
import { IconX } from "@tabler/icons-react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from "@/admin/components/ui";
import { adminFaqCategoryDetailSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "published", label: PUBLISH_LABELS.published },
  { value: "draft", label: PUBLISH_LABELS.draft },
] as const;

export function FaqCategoryItemsFilters() {
  const [, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    adminFaqCategoryDetailSearchParamsParsers,
    {
      history: "push",
      shallow: false,
      startTransition,
    },
  );

  const setSearchDebounced = useDebouncedCallback((value: string) => {
    void setParams({ search: value || null, page: 1 });
  }, 300);

  const handleStatusChange = (value: string) => {
    if (value === "all" || value === "published" || value === "draft") {
      void setParams({ status: value, page: 1 });
    }
  };

  const handleReset = () => {
    void setParams({
      search: null,
      status: null,
      page: null,
    });
  };

  const hasFilters = params.search !== "" || params.status !== "all";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

      <div className="flex-1">
        <Input
          type="search"
          placeholder="質問・回答で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
          aria-label="質問を検索"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <IconX className="mr-1 h-4 w-4" aria-hidden="true" />
          リセット
        </Button>
      )}
    </div>
  );
}
