"use client";

import { BaseFilters } from "@/admin/components/table";
import { INQUIRY_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(INQUIRY_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export function InquiryFilters() {
  return (
    <BaseFilters
      statusOptions={STATUS_OPTIONS}
      searchPlaceholder="名前、メール、件名、本文で検索..."
    />
  );
}
