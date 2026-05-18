"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { CouponTypeBadge } from "./CouponStatusBadge";
import { CouponStateToggle } from "./CouponStateToggle";
import { CouponActionCell } from "./CouponActionCell";
import { CouponBulkActions } from "./CouponBulkActions";
import type { CouponData } from "@/shared/domain/coupons/types";
import type { CouponStatusType } from "../_lib/coupon-status";
import { formatDateShort } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";

// =============================================================================
// Types
// =============================================================================

/**
 * `coupons` には Server Component 側で `getCouponStatus(coupon, now)` で
 * 事前計算した `status` を埋め込んだ拡張型を渡す。
 */
export type CouponWithStatus = CouponData & { status: CouponStatusType };

type CouponTableProps = {
  coupons: readonly CouponWithStatus[];
};

// =============================================================================
// Helpers
// =============================================================================

function formatDiscountValue(type: CouponData["type"], value: number): string {
  if (type === "PERCENTAGE") {
    return `${value}%`;
  }
  return formatPrice(value);
}

// =============================================================================
// CouponTable Component
// =============================================================================

export function CouponTable({ coupons }: CouponTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = coupons.map((c) => c.id);
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

  if (coupons.length === 0) {
    return (
      <EmptyState
        message="クーポンがありません"
        action={{ label: "新規クーポン", href: "/admin/coupons/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <CheckboxCell
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="すべてのクーポンを選択"
                  />
                </TableHead>
                <TableHead>コード</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>タイプ</TableHead>
                <TableHead className="text-right">割引</TableHead>
                <TableHead className="hidden text-center md:table-cell">
                  利用数
                </TableHead>
                <TableHead className="hidden lg:table-cell">有効期間</TableHead>
                <TableHead className="text-center">ステータス</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <ClickableTableRow
                  key={coupon.id}
                  href={`/admin/coupons/${coupon.id}`}
                  aria-label={`${coupon.name} を編集`}
                >
                  <TableCell onClick={stopRowClick}>
                    <CheckboxCell
                      checked={selectedIds.includes(coupon.id)}
                      onChange={() => toggleOne(coupon.id)}
                      aria-label={`${coupon.name} を選択`}
                    />
                  </TableCell>
                  <TableCell className="font-mono font-medium">
                    {coupon.code}
                  </TableCell>
                  <TableCell>{coupon.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <CouponTypeBadge type={coupon.type} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatDiscountValue(coupon.type, coupon.discountValue)}
                  </TableCell>
                  <TableCell className="hidden text-center text-muted-foreground md:table-cell">
                    {coupon.usageCount}
                    {coupon.usageLimit && ` / ${coupon.usageLimit}`}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    <div className="text-xs">
                      <div>{formatDateShort(coupon.validFrom)} 〜</div>
                      <div>
                        {coupon.validUntil
                          ? formatDateShort(coupon.validUntil)
                          : "無期限"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center" onClick={stopRowClick}>
                    <CouponStateToggle
                      id={coupon.id}
                      isActive={coupon.isActive}
                      status={coupon.status}
                      name={coupon.name}
                    />
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <CouponActionCell couponId={coupon.id} />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <CouponBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
