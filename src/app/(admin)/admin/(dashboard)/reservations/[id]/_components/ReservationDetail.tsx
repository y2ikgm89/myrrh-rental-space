"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import {
  CustomerIdentityBadge,
  ReservationStatusBadge,
} from "@/admin/components/status-badges";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { openExternalTab } from "@/admin/lib/open-external-tab";
import {
  updateReservationStatus,
  updateReservationNotes,
  createCheckoutSession,
  refundReservationPayment,
  updateCustomerFromReservation,
} from "@/admin/actions/reservation";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  CANCELLED_BY,
  CANCELLED_BY_LABELS,
  TAX_RATE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidTaxRateType } from "@/shared/lib/validations/enums/guards";
import { formatDateTimeFull } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";

const PAYMENT_BADGE_VARIANTS: Record<
  string,
  "secondary" | "warning" | "success" | "outline" | "destructive"
> = {
  [PaymentStatus.UNPAID]: "secondary",
  [PaymentStatus.PENDING]: "warning",
  [PaymentStatus.PAID]: "success",
  [PaymentStatus.REFUNDED]: "outline",
  [PaymentStatus.FAILED]: "destructive",
};

type ReservationDetailProps = {
  reservation: ReservationWithRelations;
};

function PriceBreakdown({
  reservation,
}: {
  reservation: ReservationWithRelations;
}) {
  const {
    basePrice,
    couponDiscountAmount,
    durationDiscountAmount,
    spaceDiscountAmount,
    totalPrice,
    taxRateType,
    taxRate,
    taxAmount,
    totalPriceWithTax,
  } = reservation;
  const couponDiscount = couponDiscountAmount ?? 0;
  const durationDiscount = durationDiscountAmount ?? 0;
  const spaceDiscount = spaceDiscountAmount ?? 0;
  const hasDiscount =
    couponDiscount > 0 || durationDiscount > 0 || spaceDiscount > 0;
  const hasTax = taxAmount != null && taxAmount > 0;
  const taxRateLabel =
    taxRateType && isValidTaxRateType(taxRateType)
      ? TAX_RATE_LABELS[taxRateType]
      : taxRateType;

  return (
    <DetailSection title="料金明細">
      <dl className="divide-y divide-border text-sm">
        {hasDiscount && basePrice != null && (
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-muted-foreground">基本料金</dt>
            <dd>{formatPrice(basePrice)}</dd>
          </div>
        )}
        {spaceDiscount > 0 && (
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-muted-foreground">スペース割引</dt>
            <dd className="text-success">−{formatPrice(spaceDiscount)}</dd>
          </div>
        )}
        {durationDiscount > 0 && (
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-muted-foreground">長時間割引</dt>
            <dd className="text-success">−{formatPrice(durationDiscount)}</dd>
          </div>
        )}
        {couponDiscount > 0 && (
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-muted-foreground">クーポン割引</dt>
            <dd className="text-success">−{formatPrice(couponDiscount)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between py-2">
          <dt className={hasTax ? "text-muted-foreground" : "font-medium"}>
            合計金額
          </dt>
          <dd className={hasTax ? "" : "text-base font-medium"}>
            {formatPrice(totalPrice)}
          </dd>
        </div>
        {hasTax && (
          <>
            <div className="flex items-baseline justify-between py-2">
              <dt className="text-muted-foreground">
                {`消費税${taxRateType ? `(${taxRateLabel}${taxRate != null ? ` ${taxRate}%` : ""})` : ""}`}
              </dt>
              <dd>{formatPrice(taxAmount)}</dd>
            </div>
            {totalPriceWithTax != null && (
              <div className="flex items-baseline justify-between py-2">
                <dt className="font-medium">税込合計</dt>
                <dd className="text-base font-medium">
                  {formatPrice(totalPriceWithTax)}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
    </DetailSection>
  );
}

export function ReservationDetail({ reservation }: ReservationDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPaymentPending, startPaymentTransition] = useTransition();
  const [notes, setNotes] = useState(reservation.notes || "");
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [isUpdateCustomerPending, startUpdateCustomerTransition] =
    useTransition();

  const handleUpdateCustomer = () => {
    startUpdateCustomerTransition(async () => {
      const result = await updateCustomerFromReservation(reservation.id);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("顧客情報を更新しました");
        router.refresh();
      }
    });
  };

  const handleStatusChange = async (newStatus: ReservationStatus) => {
    if (newStatus === reservation.status) return;

    startTransition(async () => {
      const result = await updateReservationStatus(reservation.id, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ステータスを更新しました");
      router.refresh();
    });
  };

  const handleNotesUpdate = async () => {
    startTransition(async () => {
      const result = await updateReservationNotes(
        reservation.id,
        notes || null,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("メモを更新しました");
      router.refresh();
    });
  };

  const handleCreateCheckoutSession = () => {
    startPaymentTransition(async () => {
      const result = await createCheckoutSession(reservation.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      if (result.sessionUrl) {
        openExternalTab(result.sessionUrl);
        toast.success("決済リンクを作成しました");
      } else {
        toast.error("決済URLの取得に失敗しました");
      }
      router.refresh();
    });
  };

  const handleRefund = () => {
    startPaymentTransition(async () => {
      const result = await refundReservationPayment(reservation.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("返金処理が完了しました");
      setRefundDialogOpen(false);
      router.refresh();
    });
  };

  // Guest info diff computation
  const guestName = reservation.guestLastName
    ? `${reservation.guestLastName} ${reservation.guestFirstName ?? ""}`.trim()
    : null;
  const customerName =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const hasNameDiff = guestName !== null && guestName !== customerName;
  const hasPhoneDiff =
    reservation.guestPhone != null &&
    reservation.guestPhone !== reservation.customer.phoneNumber;
  const hasGuestDiff = hasNameDiff || hasPhoneDiff;

  return (
    <div className="space-y-6">
      {/* ステータス */}
      <Card>
        <CardHeader>
          <CardTitle>ステータス</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <ReservationStatusBadge status={reservation.status} />
            <Select
              value={reservation.status}
              onValueChange={(value) => {
                if (isValidReservationStatus(value)) handleStatusChange(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger
                className="w-48"
                aria-label={`予約ステータスを変更（現在: ${RESERVATION_STATUS_LABELS[reservation.status]}）`}
              >
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ReservationStatus.PENDING}>
                  {RESERVATION_STATUS_LABELS[ReservationStatus.PENDING]}に変更
                </SelectItem>
                <SelectItem value={ReservationStatus.CONFIRMED}>
                  {RESERVATION_STATUS_LABELS[ReservationStatus.CONFIRMED]}に変更
                </SelectItem>
                <SelectItem value={ReservationStatus.CANCELLED}>
                  {RESERVATION_STATUS_LABELS[ReservationStatus.CANCELLED]}に変更
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 予約情報 */}
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
          <DetailField
            label="開始日時"
            value={formatDateTimeFull(reservation.startTime)}
          />
          <DetailField
            label="終了日時"
            value={formatDateTimeFull(reservation.endTime)}
          />
          <DetailField
            label="作成日時"
            value={formatDateTimeFull(reservation.createdAt)}
          />
          <DetailField
            label="更新日時"
            value={formatDateTimeFull(reservation.updatedAt)}
          />
        </div>
      </DetailSection>

      {/* 料金明細
        basePrice / 各割引 / totalPrice / taxAmount / totalPriceWithTax。
        税フィールドは customer-commands.ts (顧客セルフ変更経路) のみ populate、
        admin 経路 (public + admin) は書き込まないため null が普通。null 判定で
        安全に条件描画する（customer-facing detail (mypage) と同一 SSoT パターン）。 */}
      <PriceBreakdown reservation={reservation} />

      {/* 決済情報 */}
      <DetailSection title="決済情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="決済ステータス"
            value={
              <Badge
                variant={PAYMENT_BADGE_VARIANTS[reservation.paymentStatus]}
              >
                {PAYMENT_STATUS_LABELS[reservation.paymentStatus]}
              </Badge>
            }
          />
          {reservation.paidAt ? (
            <DetailField
              label="支払い日時"
              value={formatDateTimeFull(reservation.paidAt)}
            />
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {reservation.paymentStatus === PaymentStatus.UNPAID ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPaymentPending}
              onClick={() => void handleCreateCheckoutSession()}
            >
              {isPaymentPending ? "作成中..." : "決済リンクを作成"}
            </Button>
          ) : null}
          {reservation.paymentStatus === PaymentStatus.PAID ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={isPaymentPending}
              onClick={() => setRefundDialogOpen(true)}
            >
              返金する
            </Button>
          ) : null}
        </div>
      </DetailSection>

      {/* 顧客情報 */}
      <DetailSection title="顧客情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="氏名"
            value={
              <span className="inline-flex items-center gap-2">
                <span>
                  {reservation.customer.lastName}{" "}
                  {reservation.customer.firstName}
                </span>
                <CustomerIdentityBadge userId={reservation.customer.userId} />
              </span>
            }
          />
          {reservation.customer.companyName ? (
            <DetailField
              label="会社名・団体名"
              value={reservation.customer.companyName}
            />
          ) : null}
          <DetailField
            label="メールアドレス"
            value={reservation.customer.email}
          />
          <DetailField
            label="電話番号"
            value={reservation.customer.phoneNumber || "-"}
          />
        </div>
        {hasGuestDiff && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
            <p className="mb-2 text-sm font-medium text-warning-strong">
              予約時の入力情報が顧客情報と異なります
            </p>
            <dl className="space-y-1 text-sm">
              {hasNameDiff && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">予約時の名前:</dt>
                  <dd>{guestName}</dd>
                </div>
              )}
              {hasPhoneDiff && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">予約時の電話:</dt>
                  <dd>{reservation.guestPhone}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdateCustomer}
                disabled={isUpdateCustomerPending}
              >
                {isUpdateCustomerPending ? "更新中..." : "顧客情報を更新"}
              </Button>
            </div>
          </div>
        )}
      </DetailSection>

      {/* キャンセル情報 */}
      {reservation.status === ReservationStatus.CANCELLED && (
        <DetailSection title="キャンセル情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="キャンセル者"
              value={
                reservation.cancelledByType === CANCELLED_BY.CUSTOMER
                  ? CANCELLED_BY_LABELS[CANCELLED_BY.CUSTOMER]
                  : reservation.cancelledByType === CANCELLED_BY.ADMIN
                    ? CANCELLED_BY_LABELS[CANCELLED_BY.ADMIN]
                    : "不明"
              }
            />
            {reservation.cancelledAt && (
              <DetailField
                label="キャンセル日時"
                value={reservation.cancelledAt}
              />
            )}
          </div>
          {reservation.cancellationReason && (
            <DetailField
              label="キャンセル理由"
              value={
                <p className="whitespace-pre-wrap text-sm">
                  {reservation.cancellationReason}
                </p>
              }
            />
          )}
        </DetailSection>
      )}

      {/* メモ */}
      <Card>
        <CardHeader>
          <CardTitle>メモ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="メモを入力..."
            disabled={isPending}
          />
          <Button
            onClick={handleNotesUpdate}
            disabled={isPending || notes === (reservation.notes || "")}
          >
            メモを保存
          </Button>
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        title="返金確認"
        description="この予約の決済を返金しますか？この操作は取り消せません。"
        onConfirm={handleRefund}
        isPending={isPaymentPending}
      />
    </div>
  );
}
