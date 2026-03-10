"use client";

import { BaseFilters, type StatusOption } from "@/admin/components/table";

const STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "PENDING", label: "確認待ち" },
  { value: "CONFIRMED", label: "確定" },
  { value: "CANCELLED", label: "キャンセル" },
];

export function ReservationFilters() {
  return (
    <BaseFilters
      statusOptions={STATUS_OPTIONS}
      searchPlaceholder="顧客名、スペース名で検索..."
    />
  );
}
