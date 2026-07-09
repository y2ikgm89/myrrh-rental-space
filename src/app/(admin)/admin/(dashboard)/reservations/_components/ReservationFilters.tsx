"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import { Input } from "@/admin/components/ui";

/**
 * 予約管理一覧のフィルター（期間 + 検索）。
 *
 * ステータス絞り込みは `ReservationTabs`（nuqs `useQueryStates` shallow:false）に移管済み。
 * Filter は他テーブル (Event canonical) と同型の構造に整合。
 */
export function ReservationFilters() {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    {
      history: "replace",
      shallow: false,
    },
  );

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium text-muted-foreground">期間:</span>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <Input
            type="date"
            aria-label="開始日"
            value={params.dateFrom}
            onChange={(e) =>
              void setParams({ dateFrom: e.target.value || null, page: 1 })
            }
            className="min-w-0 sm:w-[160px]"
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <Input
            type="date"
            aria-label="終了日"
            value={params.dateTo}
            onChange={(e) =>
              void setParams({ dateTo: e.target.value || null, page: 1 })
            }
            className="min-w-0 sm:w-[160px]"
          />
        </div>
      </div>
      <div className="flex-1">
        <Input
          placeholder="顧客名、スペース名で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
    </div>
  );
}
