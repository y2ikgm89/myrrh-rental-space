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
import { Search } from "lucide-react";
import { useFilterParams } from "@/admin/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";

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
  { value: "PUBLISHED", label: "公開中" },
  { value: "DRAFT", label: "下書き" },
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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
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
