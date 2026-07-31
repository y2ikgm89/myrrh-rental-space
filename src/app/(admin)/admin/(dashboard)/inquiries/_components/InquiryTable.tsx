"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { InquiryListItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import { InquiryActionCell } from "./InquiryActionCell";
import { InquiryBulkActions } from "./InquiryBulkActions";

// =============================================================================
// Types
// =============================================================================

type InquiryTableProps = {
  inquiries: Serialized<InquiryListItem>[];
};

// =============================================================================
// InquiryTable Component
// =============================================================================

export function InquiryTable({ inquiries }: InquiryTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = inquiries.map((i) => i.id);

  // Round-5 audit Finding #10: 検索・並び替え・ページ移動で inquiries が入れ替わっても
  // selectedIds はローカル state に残るため、次の一括操作で見えていない過去選択の
  // お問い合わせまで対象になる。CouponTable.tsx と同型の修正。
  const visibleIdSet = new Set(allIds);
  const effectiveSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  if (inquiries.length === 0) {
    return <EmptyState message="お問い合わせがありません" />;
  }

  return (
    <>
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <CheckboxCell
                  checked={allSelected}
                  onChange={() => toggleAll()}
                  aria-label="すべての行を選択"
                />
              </TableHead>
              <TableHead>件名</TableHead>
              <TableHead className="hidden md:table-cell">お名前</TableHead>
              <TableHead className="hidden lg:table-cell">
                メールアドレス
              </TableHead>
              <TableHead className="hidden md:table-cell">顧客</TableHead>
              <TableHead className="hidden lg:table-cell">担当者</TableHead>
              <TableHead className="hidden lg:table-cell">タグ</TableHead>
              <TableHead className="hidden md:table-cell">受付日時</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.map((inquiry) => (
              <ClickableTableRow
                key={inquiry.id}
                href={`/admin/inquiries/${inquiry.id}`}
                aria-label={`${inquiry.subject} の詳細を表示`}
              >
                <TableCell onClick={stopRowClick}>
                  <CheckboxCell
                    checked={selectedIds.includes(inquiry.id)}
                    onChange={() => toggleOne(inquiry.id)}
                    aria-label={`${inquiry.subject} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="max-w-xs truncate font-medium">
                    {inquiry.subject}
                  </div>
                  {/* Inquiry Overhaul Phase 1: 受付番号 (INQ-XXXXXXXX) を副次表示 */}
                  <div className="text-xs text-muted-foreground">
                    {inquiry.receiptNumber}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="font-medium">{inquiry.name}</div>
                  {inquiry.companyName ? (
                    <div className="text-xs text-muted-foreground">
                      {inquiry.companyName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell
                  onClick={stopRowClick}
                  className="hidden lg:table-cell"
                >
                  <a
                    href={`mailto:${inquiry.email}`}
                    className="text-primary hover:underline"
                  >
                    {inquiry.email}
                  </a>
                </TableCell>
                <TableCell
                  onClick={stopRowClick}
                  className="hidden md:table-cell"
                >
                  {inquiry.customer ? (
                    <Link
                      href={`/admin/customers/${inquiry.customer.id}`}
                      className="text-primary hover:underline"
                    >
                      {inquiry.customer.lastName} {inquiry.customer.firstName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {inquiry.assigneeName ?? (
                    <span className="text-muted-foreground">未割当</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {inquiry.tagNames && inquiry.tagNames.length > 0 ? (
                    // タグ名はステータスラベル（「対応中」等）と同じ文字列になり得るため、
                    // 支援技術にも自動テストにも「どちらの列か」が判別できるよう
                    // ラベル付きリストにする。`list-style: none` を当てる Tailwind
                    // preflight 下では Safari/VoiceOver が list role を落とすため
                    // `role="list"` を明示する（WAI-ARIA の推奨対応）。
                    <ul
                      role="list"
                      aria-label="タグ"
                      className="flex flex-wrap gap-1"
                    >
                      {inquiry.tagNames.map((name) => (
                        <li key={name}>
                          <Badge variant="outline">{name}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDateTimeShort(inquiry.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <InquiryStatusBadge status={inquiry.status} />
                </TableCell>
                <TableCell className="text-right" onClick={stopRowClick}>
                  <InquiryActionCell inquiryId={inquiry.id} />
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>

      <InquiryBulkActions
        selectedIds={effectiveSelectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
