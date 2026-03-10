"use client";

import { BaseFilters } from "@/admin/components/table";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "NEW", label: "新規" },
  { value: "IN_PROGRESS", label: "対応中" },
  { value: "RESOLVED", label: "解決済み" },
  { value: "CLOSED", label: "クローズ" },
];

export function InquiryFilters() {
  return (
    <BaseFilters
      statusOptions={STATUS_OPTIONS}
      searchPlaceholder="名前、メール、件名、本文で検索..."
    />
  );
}
