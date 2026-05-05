"use client";

/**
 * ベースフィルターコンポーネント
 *
 * 管理画面の一覧ページで共通するフィルターUI
 * - ステータスセレクト
 * - 検索入力（デバウンス付き）
 *
 * @description nuqs を使用した型安全な URL パラメータ管理
 */

import type { ReactNode } from "react";
import { IconSearch } from "@tabler/icons-react";
import { useFilterParams } from "@/admin/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { POST_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

type StatusOption = {
  value: string;
  label: string;
};

type BaseFiltersProps = {
  /** ステータスオプション */
  statusOptions?: StatusOption[];
  /** 検索プレースホルダー */
  searchPlaceholder?: string;
  /** 追加フィルター（カテゴリなど） */
  children?: ReactNode;
};

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(POST_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

// =============================================================================
// BaseFilters Component
// =============================================================================

export function BaseFilters({
  statusOptions = DEFAULT_STATUS_OPTIONS,
  searchPlaceholder = "タイトル、本文で検索...",
  children,
}: BaseFiltersProps) {
  const { params, setSearchDebounced, setStatus } = useFilterParams();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* ステータスフィルター（オプションがある場合のみ表示） */}
      {statusOptions.length > 0 && (
        <div className="w-full sm:w-48">
          <Select value={params.status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 追加フィルター（カテゴリなど） */}
      {children}

      {/* 検索 */}
      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          // `defaultValue` は初回マウント時のみ反映されるため、URL から
          // search を消した（クリアボタン押下 → `setParams({ search: null })`）
          // 後も Input 表示が古い文字列のまま残る silent bug を防ぐ。
          // `key={params.search}` で URL 同期時に Input を remount する。
          key={params.search}
          type="search"
          placeholder={searchPlaceholder}
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}

// =============================================================================
// Re-export types for consumers
// =============================================================================

export type { StatusOption, BaseFiltersProps };
