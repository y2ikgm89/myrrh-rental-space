"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(RESERVATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">期間:</span>
        <Input
          type="date"
          aria-label="開始日"
          value={params.dateFrom}
          onChange={(e) =>
            void setParams({ dateFrom: e.target.value || null, page: 1 })
          }
          className="w-full sm:w-[160px]"
        />
        <span className="text-sm text-muted-foreground">〜</span>
        <Input
          type="date"
          aria-label="終了日"
          value={params.dateTo}
          onChange={(e) =>
            void setParams({ dateTo: e.target.value || null, page: 1 })
          }
          className="w-full sm:w-[160px]"
        />
      </div>
      <div className="flex-1">
        <Input
          placeholder="顧客名、スペース名で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
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
  );
}
