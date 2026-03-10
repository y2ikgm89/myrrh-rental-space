"use client";

import { BaseFilters, type StatusOption } from "@/admin/components/table";

const CUSTOMER_STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "NEW", label: "新規" },
  { value: "REGULAR", label: "リピーター" },
  { value: "VIP", label: "VIP" },
  { value: "INACTIVE", label: "休眠" },
  { value: "BLACKLIST", label: "ブラックリスト" },
];

export function CustomerFilters() {
  return (
    <BaseFilters
      statusOptions={CUSTOMER_STATUS_OPTIONS}
      searchPlaceholder="名前、メール、電話番号で検索..."
    />
  );
}
