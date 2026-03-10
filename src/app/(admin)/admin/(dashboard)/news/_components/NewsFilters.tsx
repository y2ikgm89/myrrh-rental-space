"use client";

/**
 * ニュース一覧フィルター
 */

import { BaseFilters } from "@/admin/components/table";

export function NewsFilters() {
  return <BaseFilters searchPlaceholder="タイトル、本文で検索..." />;
}
