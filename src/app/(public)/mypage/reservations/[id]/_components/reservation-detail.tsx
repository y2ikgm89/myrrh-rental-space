import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import { formatPrice } from "@/shared/lib/pricing/format";
import {
  RESERVATION_BADGE_VARIANTS,
  PAYMENT_BADGE_VARIANTS,
} from "../../../_components/reservation-badge-variants";
import { CancelledBy } from "@/shared/lib/validations/enums/prisma-types";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_ICONS,
  TAX_RATE_LABELS,
  CANCELLED_BY,
} from "@/shared/lib/validations/enums/helpers";
import {
  isValidReservationStatus,
  isValidTaxRateType,
} from "@/shared/lib/validations/enums/guards";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { getAppUrl } from "@/shared/lib/constants";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/public/components/ui/add-to-calendar";
import { DetailRow } from "@/public/components/detail-row";
import { PasscodeReveal } from "@/public/components/passcode-reveal";
import { ReceiptDownloadSection } from "@/public/components/receipt-download-section";
import { TransferAccountsSection } from "@/public/components/transfer-accounts-section";
import type { TransferAccountPublicDisplay } from "@/shared/domain/settings/transfer-account-queries";
import type { PasscodeRevealState } from "@/shared/domain/smart-lock/passcode-reveal-state";
import { CheckoutButton } from "./checkout-button";
import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Space {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly locationId: string;
  readonly capacity: number;
}

interface ReservationDetailData {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: ReservationStatus;
  readonly totalPrice: number | null;
  readonly basePrice: number | null;
  readonly paymentStatus: PaymentStatus;
  readonly paidAt: string | null;
  readonly taxRateType: TaxRateType | null;
  readonly taxRate: number | null;
  readonly taxAmount: number | null;
  readonly totalPriceWithTax: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly couponId: string | null;
  readonly couponDiscountAmount: number | null;
  readonly durationDiscountAmount: number | null;
  readonly spaceDiscountAmount: number | null;
  readonly cancellationReason: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledByType: CancelledBy | null;
  readonly spaceId: string;
  readonly space: Space;
}

interface DeadlineSettings {
  readonly cancellationDeadlineHours: number;
  readonly modificationDeadlineHours: number;
}

interface ReservationDetailProps {
  readonly reservation: ReservationDetailData;
  readonly deadlineSettings: DeadlineSettings | undefined;
  /** 公開中のキャンセルポリシー規約 URL。無ければリンクを出さない */
  readonly cancellationPolicyUrl: string | undefined;
  /** 返金ポリシー表示行。未設定なら undefined */
  readonly refundPolicyLines?: readonly string[] | undefined;
  /**
   * オンライン決済が利用可能か (feature ON かつ Stripe credentials 設定済み)。
   * false なら CheckoutButton は表示しない (`assertOnlinePaymentAvailable` と対称)。
   */
  readonly paymentEnabled: boolean;
  /** Feature module `contact` — footer inquiry link (F-103). */
  readonly showContactLink?: boolean;
  /**
   * 発行済み領収書の serialNo。未発行 (未払 / event 側の receipt 未発行状態) は null。
   * 値がある場合は「領収書ダウンロード」リンクを表示する。ダウンロード経路は
   * Better Auth session 経由の ownership 検証 (Route Handler
   * `/api/receipts/[serialNo]/pdf`) を使う。
   */
  readonly receiptSerialNo: string | null;
  /** SwitchBot 解錠番号の非秘匿表示状態（平文なし）。 */
  readonly passcodeRevealState: PasscodeRevealState;
  readonly transferDisplay?: {
    readonly accounts: readonly TransferAccountPublicDisplay[];
    readonly guidance: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReservationDetail({
  reservation,
  deadlineSettings,
  cancellationPolicyUrl,
  refundPolicyLines,
  paymentEnabled,
  showContactLink = false,
  receiptSerialNo,
  passcodeRevealState,
  transferDisplay,
}: ReservationDetailProps) {
  const {
    id,
    status,
    space,
    startTime,
    endTime,
    totalPrice,
    basePrice,
    taxRateType,
    taxRate,
    taxAmount,
    totalPriceWithTax,
    couponDiscountAmount,
    durationDiscountAmount,
    cancellationReason,
    cancelledAt,
    cancelledByType,
    notes,
    createdAt,
  } = reservation;

  const couponDiscount = couponDiscountAmount ?? 0;
  const durationDiscount = durationDiscountAmount ?? 0;
  const hasDiscount = couponDiscount > 0 || durationDiscount > 0;
  const hasTax = taxAmount != null && taxAmount > 0;
  const taxRateLabel =
    taxRateType && isValidTaxRateType(taxRateType)
      ? TAX_RATE_LABELS[taxRateType]
      : taxRateType;
  const statusLabel = isValidReservationStatus(reservation.status)
    ? RESERVATION_STATUS_LABELS[reservation.status]
    : reservation.status;
  const paymentStatusEnum = getValidPaymentStatus(reservation.paymentStatus);
  const isActive = status === "PENDING" || status === "CONFIRMED";

  return (
    <div className="border border-border">
      {/* Header: 長 space 名 break-words + Badge cluster shrink-0 で wrap 安定。 */}
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-6">
        <Heading level={2} className="!text-xl min-w-0 break-words">
          {space.name}
        </Heading>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={RESERVATION_BADGE_VARIANTS[status] ?? "default"}>
            {isValidReservationStatus(reservation.status) ? (
              <CuratedIcon
                name={RESERVATION_STATUS_ICONS[reservation.status]}
                className="mr-1 inline h-3 w-3"
              />
            ) : null}
            {statusLabel}
          </Badge>
          <Badge variant={PAYMENT_BADGE_VARIANTS[paymentStatusEnum]}>
            {PAYMENT_STATUS_LABELS[paymentStatusEnum]}
          </Badge>
        </div>
      </div>

      {/* Detail rows */}
      <dl className="px-4 sm:px-6">
        <DetailRow label="利用日">
          {formatSerializedDate(startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </DetailRow>

        <DetailRow label="利用時間">
          {formatSerializedDate(startTime, {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          〜{" "}
          {formatSerializedDate(endTime, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </DetailRow>

        {hasDiscount && basePrice != null && (
          <DetailRow label="基本料金">{formatPrice(basePrice)}</DetailRow>
        )}

        {couponDiscount > 0 && (
          <DetailRow label="クーポン割引">
            <span className="text-success">−{formatPrice(couponDiscount)}</span>
          </DetailRow>
        )}

        {durationDiscount > 0 && (
          <DetailRow label="長時間割引">
            <span className="text-success">
              −{formatPrice(durationDiscount)}
            </span>
          </DetailRow>
        )}

        <DetailRow label={hasTax ? "小計（税抜）" : "合計金額"}>
          <span className="text-base font-medium">
            {formatPrice(totalPrice, "未定")}
          </span>
        </DetailRow>

        {hasTax && (
          <>
            <DetailRow
              label={`消費税${taxRateType ? `(${taxRateLabel}${taxRate != null ? ` ${taxRate}%` : ""})` : ""}`}
            >
              {formatPrice(taxAmount)}
            </DetailRow>
            {totalPriceWithTax != null && (
              <DetailRow label="税込合計">
                <span className="text-base font-medium">
                  {formatPrice(totalPriceWithTax)}
                </span>
              </DetailRow>
            )}
          </>
        )}

        {notes != null && notes.length > 0 && (
          <DetailRow label="備考">
            <span className="whitespace-pre-wrap">{notes}</span>
          </DetailRow>
        )}

        <DetailRow label="予約日">{formatSerializedDate(createdAt)}</DetailRow>

        {status === "CANCELLED" && cancelledAt && (
          <DetailRow label="キャンセル日">
            {formatSerializedDate(cancelledAt)}
            {/*
             * cancelledByType の SSoT は `CANCELLED_BY`
             * (helpers.ts)。現行 domain (customer-commands.ts) は
             * マイページ経路で `CUSTOMER_MYPAGE`、メールリンク経路で
             * `CUSTOMER_TOKEN` を書き込む。
             */}
            {(cancelledByType === CANCELLED_BY.CUSTOMER_MYPAGE ||
              cancelledByType === CANCELLED_BY.CUSTOMER_TOKEN) && (
              <span className="ml-2 text-xs text-muted-foreground">
                （お客様によるキャンセル）
              </span>
            )}
          </DetailRow>
        )}

        {status === "CANCELLED" && cancellationReason && (
          <DetailRow label="キャンセル理由">
            <span className="whitespace-pre-wrap">{cancellationReason}</span>
          </DetailRow>
        )}
      </dl>

      {transferDisplay ? (
        <TransferAccountsSection
          accounts={transferDisplay.accounts}
          guidance={transferDisplay.guidance}
        />
      ) : null}

      <PasscodeReveal reservationId={id} initialState={passcodeRevealState} />

      {/* Policy info (active reservations only) */}
      {isActive && deadlineSettings != null && (
        <div className="px-4 sm:px-6 py-4 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            ご利用案内
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              ・変更期限: ご利用日の
              {deadlineSettings.modificationDeadlineHours}時間前まで
            </li>
            <li>
              ・キャンセル期限: ご利用日の
              {deadlineSettings.cancellationDeadlineHours}時間前まで
            </li>
            {cancellationPolicyUrl && (
              <li>
                ・詳しくは
                <Link
                  href={toAppRoute(cancellationPolicyUrl)}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  キャンセルポリシー
                </Link>
                をご確認ください
              </li>
            )}
            {refundPolicyLines?.map((line) => (
              <li key={line}>・{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Add to Calendar (active reservations only) */}
      {status !== "CANCELLED" && (
        <div className="px-4 sm:px-6 py-4 border-t border-border">
          <AddToCalendar
            urls={buildAddToCalendarUrls({
              summary: `【予約】${space.name}`,
              description: [
                `予約ID: ${id.slice(0, 8).toUpperCase()}`,
                `スペース: ${space.name}`,
                ...(notes != null && notes.length > 0
                  ? [`備考: ${notes}`]
                  : []),
              ].join("\n"),
              startTime: new Date(startTime),
              endTime: new Date(endTime),
              icsDownloadUrl: `${getAppUrl()}/api/calendar/reservation/${id}`,
            })}
          />
        </div>
      )}

      {/* Stripe Checkout ボタン (PR#7 + Codex P1 PR#1022 + #8 FAILED gate 緩和):
        paymentStatus ∈ {UNPAID, FAILED} かつ totalPrice>0 かつ status ∈ {PENDING, CONFIRMED}
        かつ `isOnlinePaymentAvailable()` (feature ON + credentials 設定済) のみ表示。
        FAILED (前回決済失敗 / session.expired webhook で claim) からも再決済に進める。
        cancel path は status=CANCELLED / paymentStatus=UNPAID を残すので isActive gate 必須。
        `paymentEnabled` は server 側 `assertOnlinePaymentAvailable` と対称。
        createCheckoutSessionCommand の terminal-status ガードと重ねて defense-in-depth。 */}
      {paymentEnabled &&
        isActive &&
        (paymentStatusEnum === PaymentStatus.UNPAID ||
          paymentStatusEnum === PaymentStatus.FAILED) &&
        reservation.totalPrice !== null &&
        reservation.totalPrice > 0 && (
          <div className="border-t border-border px-4 py-4 sm:px-6">
            <p className="mb-3 text-sm text-muted-foreground">
              {paymentStatusEnum === PaymentStatus.FAILED
                ? "前回の決済が完了しませんでした。もう一度お試しいただけます。"
                : "オンライン決済でお支払い頂けます。決済完了までは予約は仮確定状態です。"}
            </p>
            <CheckoutButton reservationId={id} />
          </div>
        )}

      {/* 領収書ダウンロード (Receipt 発行済のみ)。
        Route Handler `/api/receipts/[serialNo]/pdf` に Better Auth session 経由で
        アクセス、Route 側で ownership を突合する。同一 origin の GET なので通常の
        `<a>` で download 属性を付ける (Link コンポーネントは page 遷移用のため
        API route には使わない)。 */}
      {receiptSerialNo && (
        <ReceiptDownloadSection
          href={`/api/receipts/${receiptSerialNo}/pdf`}
          downloadFilename={`receipt-${receiptSerialNo}.pdf`}
        />
      )}

      {/* Footer: mobile は full-width tap area / sm+ は両端寄せ */}
      <div className="flex flex-col gap-2 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
        <Link
          href="/mypage"
          className="inline-flex min-h-11 w-full items-center justify-center text-sm text-foreground underline underline-offset-4 transition-colors hover:text-accent sm:w-auto sm:justify-start"
        >
          予約に戻る
        </Link>
        {showContactLink ? (
          <Link
            href={toAppRoute(
              `/contact?subject=${encodeURIComponent(`予約 #${id.slice(0, 8)} について`)}`,
            )}
            className="inline-flex min-h-11 w-full items-center justify-center text-sm text-foreground underline underline-offset-4 transition-colors hover:text-accent sm:w-auto sm:justify-start"
          >
            この予約について問い合わせる
          </Link>
        ) : null}
      </div>
    </div>
  );
}
