"use client";

import { useQueryStates } from "nuqs";
import {
  COUPON_STATUS_FILTER_ALL,
  COUPON_TYPE_FILTER_ALL,
  adminCouponSearchParamsParsers,
  isCouponStatusFilter,
  isCouponTypeFilter,
} from "@/shared/lib/nuqs";
import { IconX } from "@tabler/icons-react";
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
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";

export function CouponFilters() {
  const [params, setParams] = useQueryStates(adminCouponSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  const clearFilters = () => {
    void setParams({
      search: null,
      status: null,
      type: null,
      page: 1,
    });
  };

  const hasFilters =
    params.status !== COUPON_STATUS_FILTER_ALL ||
    params.type !== COUPON_TYPE_FILTER_ALL ||
    params.search !== "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-[140px]">
        <Select
          value={params.status}
          onValueChange={(value) => {
            if (!isCouponStatusFilter(value)) return;
            void setParams({ status: value, page: 1 });
          }}
        >
          <SelectTrigger aria-label="ステータス">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COUPON_STATUS_FILTER_ALL}>すべて</SelectItem>
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
          value={params.type}
          onValueChange={(value) => {
            if (!isCouponTypeFilter(value)) return;
            void setParams({ type: value, page: 1 });
          }}
        >
          <SelectTrigger aria-label="割引タイプ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COUPON_TYPE_FILTER_ALL}>すべて</SelectItem>
            <SelectItem value={CouponType.PERCENTAGE}>
              パーセント割引
            </SelectItem>
            <SelectItem value={CouponType.FIXED_AMOUNT}>定額割引</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <Input
          // `key={params.search}` で URL 同期時に remount（クリア後の表示残り防止 — `BaseFilters` と同等）
          key={params.search}
          placeholder="コード・名称で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
          aria-label="クーポンコード・名称で検索"
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
