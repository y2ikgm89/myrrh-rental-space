"use client";

import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { CustomerStatusBadge } from "@/admin/components/status-badges";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import type { CustomerData } from "@/shared/domain/customers/types";
import { formatDateShort } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { CustomerActionCell } from "./CustomerActionCell";
import { CustomerBulkActions } from "./CustomerBulkActions";
import { CustomerTableHeader } from "./CustomerTableHeader";

// =============================================================================
// Types
// =============================================================================

type CustomerTableProps = {
  customers: CustomerData[];
};

// =============================================================================
// CustomerTable Component
// =============================================================================

export function CustomerTable({ customers }: CustomerTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = customers.map((c) => c.id);
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

  if (customers.length === 0) {
    return (
      <EmptyState
        message="顧客がいません"
        action={{ label: "新規顧客", href: "/admin/customers/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <CustomerTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {customers.map((customer) => {
                const guest = customer.latestGuestName;
                const hasNameMismatch =
                  guest != null &&
                  `${guest.lastName} ${guest.firstName ?? ""}`.trim() !==
                    `${customer.lastName} ${customer.firstName}`.trim();

                return (
                  <ClickableTableRow
                    key={customer.id}
                    href={`/admin/customers/${customer.id}`}
                    aria-label={`${customer.lastName} ${customer.firstName} の顧客情報を表示`}
                  >
                    <TableCell onClick={stopRowClick}>
                      <CheckboxCell
                        checked={selectedIds.includes(customer.id)}
                        onChange={() => toggleOne(customer.id)}
                        aria-label={`${customer.lastName} ${customer.firstName} を選択`}
                      />
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
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">
                        {CUSTOMER_TYPE_LABELS[customer.customerType]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="hidden lg:table-cell"
                      onClick={stopRowClick}
                    >
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
                    <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                      {formatPrice(customer.totalSpent, "-")}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {customer.lastReservationAt
                        ? formatDateShort(customer.lastReservationAt)
                        : "-"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDateShort(customer.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <CustomerStatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-right" onClick={stopRowClick}>
                      <CustomerActionCell customerId={customer.id} />
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <CustomerBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
