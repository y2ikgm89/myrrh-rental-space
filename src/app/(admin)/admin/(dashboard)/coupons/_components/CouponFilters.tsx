"use client";

import { useQueryStates } from "nuqs";
import { adminCouponSearchParamsParsers } from "@/shared/lib/nuqs";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

export function CouponFilters() {
  const [params, setParams] = useQueryStates(adminCouponSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  const clearFilters = () => {
    void setParams({ search: null, status: null, type: null, page: 1 });
  };

  const hasFilters = params.status || params.type || params.search;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-[140px]">
        <Select
          value={params.status || "ALL"}
          onValueChange={(value) =>
            void setParams({ status: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="active">有効</SelectItem>
            <SelectItem value="inactive">無効</SelectItem>
            <SelectItem value="expired">期限切れ</SelectItem>
            <SelectItem value="limitReached">上限到達</SelectItem>
            <SelectItem value="notStarted">期間前</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-[160px]">
        <Select
          value={params.type || "ALL"}
          onValueChange={(value) =>
            void setParams({ type: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="割引タイプ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="PERCENTAGE">パーセント割引</SelectItem>
            <SelectItem value="FIXED_AMOUNT">定額割引</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="relative flex-1 min-w-[200px]">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="コード・名称で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <IconX className="mr-1 h-4 w-4" />
          クリア
        </Button>
      )}
    </div>
  );
}
