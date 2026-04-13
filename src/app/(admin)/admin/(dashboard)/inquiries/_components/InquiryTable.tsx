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
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { InquiryWithCustomer } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import { InquiryActionCell } from "./InquiryActionCell";

// =============================================================================
// Types
// =============================================================================

type InquiryTableProps = {
  inquiries: Serialized<InquiryWithCustomer>[];
};

// =============================================================================
// InquiryTable Component (Server Component)
// =============================================================================

export function InquiryTable({ inquiries }: InquiryTableProps) {
  if (inquiries.length === 0) {
    return <EmptyState message="お問い合わせがありません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={inquiry.id}>
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
                <TableCell className="hidden lg:table-cell">
                  <a
                    href={`mailto:${inquiry.email}`}
                    className="text-primary hover:underline"
                  >
                    {inquiry.email}
                  </a>
                </TableCell>
                <TableCell className="hidden md:table-cell">
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
                <TableCell>
                  <InquiryActionCell inquiryId={inquiry.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
