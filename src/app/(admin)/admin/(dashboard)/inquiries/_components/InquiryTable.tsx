"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { InquiryWithCustomer } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import { InquiryActionCell } from "./InquiryActionCell";
import { InquiryBulkActions } from "./InquiryBulkActions";

// =============================================================================
// Types
// =============================================================================

type InquiryTableProps = {
  inquiries: Serialized<InquiryWithCustomer>[];
};

// =============================================================================
// InquiryTable Component
// =============================================================================

export function InquiryTable({ inquiries }: InquiryTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = inquiries.map((i) => i.id);
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
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
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
                <TableHead>ステータス</TableHead>
                <TableHead>件名</TableHead>
                <TableHead className="hidden md:table-cell">お名前</TableHead>
                <TableHead className="hidden lg:table-cell">
                  メールアドレス
                </TableHead>
                <TableHead className="hidden md:table-cell">顧客</TableHead>
                <TableHead className="hidden md:table-cell">受付日時</TableHead>
                <TableHead>操作</TableHead>
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
                  <TableCell className="whitespace-nowrap">
                    <InquiryStatusBadge status={inquiry.status} />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate font-medium">
                      {inquiry.subject}
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
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(inquiry.createdAt)}
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <InquiryActionCell inquiryId={inquiry.id} />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <InquiryBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
