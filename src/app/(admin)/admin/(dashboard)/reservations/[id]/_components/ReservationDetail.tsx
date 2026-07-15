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
import { RefundDialog } from "./RefundDialog";
import { openExternalTab } from "@/admin/lib/open-external-tab";
import {
  updateReservationStatus,
  updateReservationNotes,
  createCheckoutSession,
  refundReservationPayment,
  reissueReservationReceipt,
  updateCustomerFromReservation,
} from "@/admin/actions/reservation";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { ReissueReceiptDialog } from "./ReissueReceiptDialog";
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
  PaymentStatus,
  "secondary" | "warning" | "success" | "outline" | "destructive"
> = {
  [PaymentStatus.UNPAID]: "secondary",
  [PaymentStatus.PENDING]: "warning",
  [PaymentStatus.PAID]: "success",
  [PaymentStatus.PARTIALLY_REFUNDED]: "warning",
  [PaymentStatus.REFUNDED]: "outline",
  [PaymentStatus.FAILED]: "destructive",
};

type ReservationDetailProps = {
  reservation: ReservationWithRelations;
  /**
   * Feature Module `payment` (Settings.featureModules.payment) が有効か。
   * false 時は Stripe 決済リンク作成・返金ボタンを disabled + explanatory text 表示
   * （domain 層 `assertOnlinePaymentAvailable` が VALIDATION エラーで弾く UI の対称）。
   */
  paymentEnabled: boolean;
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

export function ReservationDetail({
  reservation,
  paymentEnabled,
}: ReservationDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPaymentPending, startPaymentTransition] = useTransition();
  const [notes, setNotes] = useState(reservation.notes || "");
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [reissueDialogOpen, setReissueDialogOpen] = useState(false);
  // Codex P2 (PR #1131) 対応: reissue 成功後に parent 直呼びで close → 再オープン時に
  // Dialog の internal form state (reason 等) が残る問題を防ぐため、open 発火のたびに
  // `key` を bump して Dialog を re-mount し fresh state に戻す
  // (React docs "Adjusting Some State When a Prop Changes" pattern)。
  const [reissueDialogInstance, setReissueDialogInstance] = useState(0);
  const [isReissuePending, startReissueTransition] = useTransition();

  const openReissueDialog = () => {
    setReissueDialogInstance((n) => n + 1);
    setReissueDialogOpen(true);
  };
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

  const handleRefund = (options: { amount?: number; reason?: string }) => {
    startPaymentTransition(async () => {
      const result = await refundReservationPayment(reservation.id, options);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      // partial vs full の情報を toast 文言に反映 (data は成功時に residual 情報を含む)
      const message =
        result.newPaymentStatus === PaymentStatus.PARTIALLY_REFUNDED
          ? `部分返金を実行しました (${result.refundAmount.toLocaleString()} 円、累計 ${result.cumulativeAmount.toLocaleString()} 円)`
          : "全額返金を実行しました";
      toast.success(message);
      setRefundDialogOpen(false);
      router.refresh();
    });
  };

  const handleReissueReceipt = (reason: string) => {
    if (reservation.receipt == null) return;
    const originalReceiptId = reservation.receipt.id;
    startReissueTransition(async () => {
      const result = await reissueReservationReceipt(
        reservation.id,
        originalReceiptId,
        reason,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`領収書を再発行しました (No. ${result.serialNo})`);
      setReissueDialogOpen(false);
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
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {reservation.paymentStatus === PaymentStatus.UNPAID ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPaymentPending || !paymentEnabled}
                onClick={() => void handleCreateCheckoutSession()}
                title={
                  paymentEnabled
                    ? undefined
                    : "オンライン決済機能が無効です (機能モジュールで有効化できます)"
                }
              >
                {isPaymentPending ? "作成中..." : "決済リンクを作成"}
              </Button>
            ) : null}
            {reservation.paymentStatus === PaymentStatus.PAID ||
            reservation.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={isPaymentPending || !paymentEnabled}
                onClick={() => setRefundDialogOpen(true)}
                title={
                  paymentEnabled
                    ? undefined
                    : "オンライン決済機能が無効のため返金操作を実行できません"
                }
              >
                返金する
              </Button>
            ) : null}
            {reservation.receipt != null ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isReissuePending}
                onClick={openReissueDialog}
              >
                {isReissuePending ? "処理中..." : "領収書を再発行"}
              </Button>
            ) : null}
          </div>
          {reservation.receipt != null ? (
            <p className="text-xs text-muted-foreground">
              現在の領収書: No. {reservation.receipt.serialNo}
              {reservation.receipt.revision > 0
                ? ` (訂正 rev.${reservation.receipt.revision})`
                : ""}
            </p>
          ) : null}
          {!paymentEnabled &&
            (reservation.paymentStatus === PaymentStatus.UNPAID ||
              reservation.paymentStatus === PaymentStatus.PAID ||
              reservation.paymentStatus ===
                PaymentStatus.PARTIALLY_REFUNDED) && (
              <p className="text-xs text-muted-foreground">
                オンライン決済機能が無効です。「機能モジュール」で有効化するとこの操作が実行できます。
              </p>
            )}
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

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        totalPriceWithTax={Number(reservation.totalPriceWithTax ?? 0)}
        onConfirm={handleRefund}
        isPending={isPaymentPending}
      />

      {reservation.receipt != null ? (
        <ReissueReceiptDialog
          key={`reissue-${reissueDialogInstance}`}
          open={reissueDialogOpen}
          onOpenChange={setReissueDialogOpen}
          currentSerialNo={reservation.receipt.serialNo}
          currentRevision={reservation.receipt.revision}
          onConfirm={handleReissueReceipt}
          isPending={isReissuePending}
        />
      ) : null}
    </div>
  );
}
