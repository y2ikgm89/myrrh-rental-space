"use client";

import { IconX } from "@tabler/icons-react";
import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
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
import { spaceOptionLabel } from "./reservation-form-helpers";

type ReservationFiltersProps = {
  spaces: { id: string; name: string; isPublished: boolean }[];
};

/**
 * 予約管理一覧のフィルター（期間 + 検索 + staff deep-link）。
 *
 * ステータス絞り込みは `ReservationTabs`（nuqs `useQueryStates` shallow:false）に移管済み。
 * Filter は他テーブル (Event canonical) と同型の構造に整合。
 */
export function ReservationFilters({ spaces }: ReservationFiltersProps) {
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
      {/* Round-4 audit Finding #14: staff 詳細ページの deep-link (?userId=)
          で絞り込み中であることを可視化し、解除導線を出す。 */}
      {params.userId && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void setParams({ userId: null, page: 1 })}
        >
          スタッフの担当予約のみ表示中
          <IconX className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
      <div className="min-w-0 sm:w-[200px]">
        <Select
          value={params.spaceId || "all"}
          onValueChange={(value) =>
            void setParams({
              spaceId: value === "all" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger aria-label="スペースで絞り込み">
            <SelectValue placeholder="全スペース" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全スペース</SelectItem>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {spaceOptionLabel(space)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
