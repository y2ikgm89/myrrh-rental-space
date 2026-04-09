import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { CustomerStatusBadge } from "@/admin/components/status-badges";
import type { CustomerData } from "@/shared/domain/customers/types";
import { formatDateShort } from "@/shared/lib/date-format";
import { CustomerActionCell } from "./CustomerActionCell";

// =============================================================================
// Types
// =============================================================================

type CustomerTableProps = {
  customers: CustomerData[];
};

// =============================================================================
// CustomerTable Component (Server Component)
// =============================================================================

export function CustomerTable({ customers }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <EmptyState
        message="顧客がいません"
        action={{ label: "新規顧客", href: "/admin/customers/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">ステータス</TableHead>
              <TableHead>お名前</TableHead>
              <TableHead className="hidden lg:table-cell">
                メールアドレス
              </TableHead>
              <TableHead className="hidden md:table-cell">電話番号</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                予約数
              </TableHead>
              <TableHead className="hidden lg:table-cell">最終予約</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => {
              const guest = customer.latestGuestName;
              const hasNameMismatch =
                guest != null &&
                `${guest.lastName} ${guest.firstName ?? ""}`.trim() !==
                  `${customer.lastName} ${customer.firstName}`.trim();

              return (
                <TableRow key={customer.id}>
                  <TableCell className="whitespace-nowrap">
                    <CustomerStatusBadge status={customer.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">
                        {customer.lastName} {customer.firstName}
                      </span>
                      {hasNameMismatch ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconAlertTriangle
                                size={14}
                                className="shrink-0 text-warning"
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              最新予約のゲスト名と異なります
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                    {customer.companyName ? (
                      <div className="text-xs text-muted-foreground">
                        {customer.companyName}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <a
                      href={`mailto:${customer.email}`}
                      className="text-primary hover:underline"
                    >
                      {customer.email}
                    </a>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {customer.phoneNumber || "-"}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                    {customer.totalReservations}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {customer.lastReservationAt
                      ? formatDateShort(customer.lastReservationAt)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <CustomerActionCell customerId={customer.id} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
