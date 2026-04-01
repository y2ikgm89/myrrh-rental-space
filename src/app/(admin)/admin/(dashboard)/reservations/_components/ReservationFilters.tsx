"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { IconSearch } from "@tabler/icons-react";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "PENDING", label: "確認待ち" },
  { value: "CONFIRMED", label: "確定" },
  { value: "COMPLETED", label: "完了" },
  { value: "CANCELLED", label: "キャンセル" },
  { value: "NO_SHOW", label: "無断キャンセル" },
] as const;

export function ReservationFilters() {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    {
      history: "push",
      shallow: false,
    },
  );

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  return (
    <div className="space-y-3">
      {/* ステータス + 検索 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="顧客名、スペース名で検索..."
            defaultValue={params.search}
            onChange={(e) => setSearchDebounced(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[180px]">
          <Select
            value={params.status === "" ? "ALL" : params.status}
            onValueChange={(value) =>
              void setParams({
                status: value === "ALL" ? null : value,
                page: 1,
              })
            }
          >
            <SelectTrigger>
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
      </div>

      {/* 期間フィルター */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="text-sm font-medium text-muted-foreground">期間:</span>
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="date"
            value={params.dateFrom}
            onChange={(e) =>
              void setParams({ dateFrom: e.target.value || null, page: 1 })
            }
            className="w-full sm:w-[180px]"
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <Input
            type="date"
            value={params.dateTo}
            onChange={(e) =>
              void setParams({ dateTo: e.target.value || null, page: 1 })
            }
            className="w-full sm:w-[180px]"
          />
        </div>
      </div>
    </div>
  );
}
