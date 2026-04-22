"use client";

/**
 * ページ管理フィルター
 *
 * 標準フィルターバーパターン（admin-ui-patterns.md §標準フィルターバー順序）:
 *   検索 | ステータス | 種別
 *
 * - `useDebouncedCallback` で検索入力を 300ms debounce
 * - Select の sentinel は parser のデフォルト値 `"all"` と一致
 * - 状態は `useQueryStates({ history: "push", shallow: false })` で URL 同期
 */

import { useQueryStates } from "nuqs";
import { IconSearch } from "@tabler/icons-react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  adminPageSearchParamsParsers,
  isAdminPageStatusFilter,
  isAdminPageTypeFilter,
} from "@/shared/lib/nuqs";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

export function PageFilters() {
  const [params, setParams] = useQueryStates(adminPageSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ q: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="タイトル・スラッグで検索..."
          defaultValue={params.q}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="w-full sm:w-[180px]">
        <Select
          value={params.status}
          onValueChange={(v) => {
            if (!isAdminPageStatusFilter(v)) return;
            // "all" は parser のデフォルトのため null で URL から除去
            void setParams({ status: v === "all" ? null : v, page: 1 });
          }}
        >
          <SelectTrigger aria-label="ステータス">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのステータス</SelectItem>
            <SelectItem value="published">
              {PUBLISH_LABELS.published}
            </SelectItem>
            <SelectItem value="draft">{PUBLISH_LABELS.unpublished}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-[180px]">
        <Select
          value={params.type}
          onValueChange={(v) => {
            if (!isAdminPageTypeFilter(v)) return;
            void setParams({ type: v === "all" ? null : v, page: 1 });
          }}
        >
          <SelectTrigger aria-label="種別">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての種別</SelectItem>
            <SelectItem value="system">システム</SelectItem>
            <SelectItem value="custom">カスタム</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
