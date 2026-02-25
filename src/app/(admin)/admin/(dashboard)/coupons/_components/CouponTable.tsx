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
  CouponTypeBadge,
  CouponStatusBadge,
} from "@/admin/components/status-badges";
import { formatDateShort, formatPrice } from "@/shared/lib/utils";
import type { CouponData } from "@/admin/actions/coupon";
import { CouponActionCell } from "./CouponActionCell";

// =============================================================================
// Types
// =============================================================================

type CouponTableProps = {
  coupons: CouponData[];
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
// CouponTable Component (Server Component)
// =============================================================================

export function CouponTable({ coupons }: CouponTableProps) {
  if (coupons.length === 0) {
    return (
      <EmptyState
        message="クーポンがありません"
        action={{ label: "新規クーポン", href: "/admin/coupons/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ステータス</TableHead>
              <TableHead>コード</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>タイプ</TableHead>
              <TableHead className="text-right">割引</TableHead>
              <TableHead className="hidden text-center md:table-cell">
                利用数
              </TableHead>
              <TableHead className="hidden lg:table-cell">有効期間</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell>
                  <CouponStatusBadge coupon={coupon} />
                </TableCell>
                <TableCell className="font-mono font-medium">
                  {coupon.code}
                </TableCell>
                <TableCell>{coupon.name}</TableCell>
                <TableCell>
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
                <TableCell>
                  <CouponActionCell couponId={coupon.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
