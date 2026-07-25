"use client";

import { useQueryStates } from "nuqs";
import {
  adminReservationSearchParamsParsers,
  type ReservationTabFilter,
} from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

const TAB_BASE: readonly { value: ReservationTabFilter; label: string }[] = [
  {
    value: "pending",
    label: RESERVATION_STATUS_LABELS[ReservationStatus.PENDING],
  },
  {
    value: "confirmed",
    label: RESERVATION_STATUS_LABELS[ReservationStatus.CONFIRMED],
  },
  {
    value: "completed",
    label: RESERVATION_STATUS_LABELS[ReservationStatus.COMPLETED],
  },
  {
    value: "cancelled",
    label: RESERVATION_STATUS_LABELS[ReservationStatus.CANCELLED],
  },
  { value: "all", label: "すべて" },
];

export function ReservationTabs() {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    { history: "replace", shallow: false },
  );

  return (
    <nav aria-label="予約分類">
      <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
        {TAB_BASE.map(({ value, label }) => {
          const isActive = params.tab === value;
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() =>
                  void setParams({
                    tab: value,
                    page: null,
                    sortBy: null,
                    sortOrder: null,
                  })
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:bg-background/50",
                  isActive && "bg-card text-foreground shadow-sm hover:bg-card",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
