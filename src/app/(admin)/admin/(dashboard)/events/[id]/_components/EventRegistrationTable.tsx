"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Pagination,
  Badge,
} from "@/admin/components/ui";
import { RegistrationStatusBadge } from "@/admin/components/status-badges";
import {
  adminCancelRegistration,
  refundEventRegistrationPayment,
} from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { PaymentStatus as PaymentStatusEnum } from "@/shared/lib/validations/enums/prisma-types";
import { RefundDialog } from "../../../reservations/[id]/_components/RefundDialog";

type Registration = {
  id: string;
  name: string;
  // walk-in (当日参加) では null
  email: string | null;
  phone: string | null;
  note: string | null;
  quantity: number;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  /** Stripe 経由で受領した金額 (円)。webhook / claim 経路でセット。UNPAID なら null */
  paidAmount: number | null;
  stripePaymentIntentId: string | null;
  /** Σ既 refunds.amount (task #9 PR#5 task B、残額計算に使う) */
  cumulativeRefunded: number;
  cancelledAt: string | null;
  attendedAt: string | null;
  createdAt: string;
  slotStartAt: string;
  slotEndAt: string;
};

interface EventRegistrationTableProps {
  readonly registrations: Registration[];
  /** 全申込件数（全ページ合計）。ページネーション表示に使用。 */
  readonly total: number;
  /** 現在のページ番号（1 始まり）。 */
  readonly currentPage: number;
  /** 1 ページあたり件数。 */
  readonly perPage: number;
}

function AttendanceStatusCell({
  registration,
}: {
  readonly registration: Registration;
}) {
  if (registration.status !== "CONFIRMED") {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  if (registration.attendedAt === null) {
    return <Badge variant="outline">未出席</Badge>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="success">出席済</Badge>
      <span className="text-xs text-muted-foreground">
        {formatDateTimeShort(registration.attendedAt)}
      </span>
    </div>
  );
}

/** 返金可能条件: PAID or PARTIALLY_REFUNDED、且つ Stripe payment intent と paidAmount が確定済 */
function isRefundable(reg: Registration): boolean {
  const inRefundableState =
    reg.paymentStatus === PaymentStatusEnum.PAID ||
    reg.paymentStatus === PaymentStatusEnum.PARTIALLY_REFUNDED;
  return (
    inRefundableState &&
    reg.stripePaymentIntentId !== null &&
    reg.paidAmount !== null &&
    reg.paidAmount > reg.cumulativeRefunded
  );
}

export function EventRegistrationTable({
  registrations,
  total,
  currentPage,
  perPage,
}: EventRegistrationTableProps) {
  const router = useRouter();
  const [isCancelPending, startCancelTransition] = useTransition();
  const [isRefundPending, startRefundTransition] = useTransition();
  const [refundTarget, setRefundTarget] = useState<Registration | null>(null);

  function handleCancel(registrationId: string) {
    startCancelTransition(async () => {
      const result = await adminCancelRegistration(registrationId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("申込をキャンセルしました");
        router.refresh();
      }
    });
  }

  const handleRefund = (options: { amount?: number; reason?: string }) => {
    if (!refundTarget) return;
    const target = refundTarget;
    startRefundTransition(async () => {
      const result = await refundEventRegistrationPayment(target.id, options);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      const message =
        result.newPaymentStatus === PaymentStatusEnum.PARTIALLY_REFUNDED
          ? `部分返金を実行しました (${result.refundAmount.toLocaleString()} 円、累計 ${result.cumulativeAmount.toLocaleString()} 円)`
          : "全額返金を実行しました";
      toast.success(message);
      setRefundTarget(null);
      router.refresh();
    });
  };

  if (total === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        参加申込はまだありません
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead className="hidden lg:table-cell">参加枠</TableHead>
                <TableHead className="hidden md:table-cell">メール</TableHead>
                <TableHead>参加人数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>出欠</TableHead>
                <TableHead className="hidden lg:table-cell">申込日時</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => {
                const showRefund = isRefundable(reg);
                const showCancel = reg.status === "CONFIRMED";
                const anyPending = isCancelPending || isRefundPending;
                return (
                  <TableRow key={reg.id}>
                    <TableCell className="font-medium">{reg.name}</TableCell>
                    <TableCell className="hidden lg:table-cell whitespace-nowrap">
                      {formatDateTimeShort(reg.slotStartAt)} -{" "}
                      {formatDateTimeShort(reg.slotEndAt)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {reg.email ?? (
                        <span className="text-muted-foreground italic">
                          当日参加
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{reg.quantity}名</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RegistrationStatusBadge status={reg.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <AttendanceStatusCell registration={reg} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDateTimeShort(reg.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {showRefund ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={anyPending}
                            onClick={() => setRefundTarget(reg)}
                          >
                            返金
                          </Button>
                        ) : null}
                        {showCancel ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={anyPending}
                            onClick={() => handleCancel(reg.id)}
                          >
                            キャンセル
                          </Button>
                        ) : null}
                        {!showRefund && !showCancel ? (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        perPage={perPage}
        defaultPerPage={20}
      />

      {/* Refund dialog は選択された対象があれば mount (Reservation 側と同型) */}
      {refundTarget ? (
        <RefundDialog
          open={refundTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRefundTarget(null);
          }}
          totalPriceWithTax={refundTarget.paidAmount ?? 0}
          cumulativeRefunded={refundTarget.cumulativeRefunded}
          onConfirm={handleRefund}
          isPending={isRefundPending}
        />
      ) : null}
    </div>
  );
}
