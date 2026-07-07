"use client";

import { useActionState, useState } from "react";
import {
  calculateDurationHours,
  formatJstDateString,
  formatTimeShort,
} from "@/shared/lib/date-format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  IconCalendar,
  IconMail,
  IconPhone,
  IconUser,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  SelectionBox,
  SubmitButton,
} from "@/admin/components/ui";
import { updateReservationAction } from "@/admin/actions/reservation";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  CREATABLE_RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TRANSITIONS,
} from "@/shared/lib/validations/enums/helpers";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import type { DiscountCombinationMode } from "@/shared/lib/validations/enums/prisma-types";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
import { updateReservationFormSchema } from "./reservation-form-schema";
import { type SpaceOption } from "./reservation-form-helpers";

type ReservationEditFormProps = {
  reservation: ReservationWithRelations;
  spaces: SpaceOption[];
  discountSettings: {
    durationDiscountEnabled: boolean;
    durationDiscountRules: DurationDiscountRule[];
    discountCombinationMode: DiscountCombinationMode;
  };
};

const STATUS_DESCRIPTIONS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "確認待ち",
  [ReservationStatus.CONFIRMED]: "予約が確定済み",
  [ReservationStatus.COMPLETED]: "利用完了",
  [ReservationStatus.CANCELLED]: "予約をキャンセル",
  [ReservationStatus.NO_SHOW]: "連絡なしキャンセル",
};

const ALL_STATUS_OPTIONS: Record<
  string,
  { label: string; description: string }
> = Object.fromEntries(
  Object.values(ReservationStatus).map(
    (status): [string, { label: string; description: string }] => [
      status,
      {
        label: RESERVATION_STATUS_LABELS[status],
        description: STATUS_DESCRIPTIONS[status],
      },
    ],
  ),
);

// CANCELLED/COMPLETED/NO_SHOW への遷移は返金・キャンセルメール等の副作用チェーンを
// 経由しないため、この編集フォームでは選択肢から除外する（予約詳細画面の専用ステータス
// 変更経路のみが対象。currentStatus 自体が終端でも表示は維持する）。
function getStatusOptionsForCurrent(currentStatus: ReservationStatus) {
  const transitions = RESERVATION_STATUS_TRANSITIONS[currentStatus] ?? [];
  const allowed = [currentStatus, ...transitions].filter(
    (value) =>
      value === currentStatus || CREATABLE_RESERVATION_STATUSES.includes(value),
  );
  return allowed.flatMap((value) => {
    const option = ALL_STATUS_OPTIONS[value];
    if (!option) return [];
    return [{ value, label: option.label, description: option.description }];
  });
}

const TIME_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});

export function ReservationEditForm({
  reservation,
  spaces,
  discountSettings,
}: ReservationEditFormProps) {
  const router = useRouter();
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined);

  // datetime は JST 固定で整形する（ローカル tz 依存だと SSR=UTC / CSR=JST で
  // hydration mismatch + 海外管理者で tz 非固定になる silent bug）。
  const initialDate = formatJstDateString(reservation.startTime);
  const initialStartTime = formatTimeShort(reservation.startTime);
  const initialEndTime = formatTimeShort(reservation.endTime);

  const [spaceId, setSpaceId] = useState<string>(reservation.spaceId);
  const [startTime, setStartTime] = useState<string>(initialStartTime);
  const [endTime, setEndTime] = useState<string>(initialEndTime);
  const [status, setStatus] = useState<ReservationStatus>(reservation.status);

  const boundAction = updateReservationAction.bind(null, reservation.id);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `reservation-edit-${reservation.id}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateReservationFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      date: initialDate,
      couponCode: reservation.coupon?.code ?? "",
      notes: reservation.notes ?? "",
    },
  });

  const selectedSpace = spaces.find((s) => s.id === spaceId);

  // 料金プレビューはサーバー側 updateAdminReservationCommand と同じ
  // calculateReservationPrice を SSoT として共有する。クーポンはサーバー側で
  // 検証・適用されるため preview には含めない（手動 totalPrice 上書きで調整可能）。
  const priceCalc = (() => {
    if (!selectedSpace || !startTime || !endTime) return null;
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return null;
    }
    const hours = calculateDurationHours(start, end);
    return calculateReservationPrice({
      hourlyPrice: selectedSpace.hourlyPrice,
      hours,
      durationRules: discountSettings.durationDiscountRules,
      durationDiscountEnabled: discountSettings.durationDiscountEnabled,
      spaceDiscount:
        selectedSpace.discountType !== "none" &&
        selectedSpace.discountValue != null &&
        selectedSpace.discountValue > 0
          ? {
              discountType: selectedSpace.discountType,
              discountValue: selectedSpace.discountValue,
              durationDiscountOverride: selectedSpace.durationDiscountOverride,
            }
          : null,
      coupon: null,
      combinationMode: discountSettings.discountCombinationMode,
      showWarning: false,
    });
  })();

  const calculatedPrice = priceCalc?.totalPrice ?? null;
  const basePrice = priceCalc?.basePrice ?? null;
  const totalDiscount =
    (priceCalc?.spaceDiscount ?? 0) + (priceCalc?.durationDiscount ?? 0);
  const displayPrice = manualPrice ?? calculatedPrice;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* customerId / spaceId / startTime / endTime / status hidden inputs */}
      <input
        type="hidden"
        name={fields.customerId.name}
        value={reservation.customerId}
      />
      <input type="hidden" name={fields.spaceId.name} value={spaceId} />
      <input type="hidden" name={fields.startTime.name} value={startTime} />
      <input type="hidden" name={fields.endTime.name} value={endTime} />
      <input type="hidden" name={fields.status.name} value={status} />
      <input
        type="hidden"
        name={fields.totalPrice.name}
        value={manualPrice ?? ""}
      />

      {form.errors && form.errors.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {form.errors.join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: 予約情報 */}
        <Card>
          <CardHeader>
            <CardTitle>予約情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="spaceId">スペース *</Label>
              <Select
                value={spaceId}
                onValueChange={setSpaceId}
                disabled={isPending}
              >
                <SelectTrigger id="spaceId">
                  <SelectValue placeholder="スペースを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.name} - {formatCurrency(space.hourlyPrice)}/時間
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fields.spaceId.errors && (
                <p
                  id={fields.spaceId.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.spaceId.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.date.id}>日付 *</Label>
              <div className="relative">
                <Input
                  {...getInputProps(fields.date, { type: "date" })}
                  disabled={isPending}
                  className="pr-10"
                />
                <IconCalendar
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
              </div>
              {fields.date.errors && (
                <p
                  id={fields.date.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.date.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">開始時間 *</Label>
                <Select
                  value={startTime}
                  onValueChange={setStartTime}
                  disabled={isPending}
                >
                  <SelectTrigger id="startTime">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.startTime.errors && (
                  <p
                    id={fields.startTime.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.startTime.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">終了時間 *</Label>
                <Select
                  value={endTime}
                  onValueChange={setEndTime}
                  disabled={isPending}
                >
                  <SelectTrigger id="endTime">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.endTime.errors && (
                  <p
                    id={fields.endTime.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.endTime.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {displayPrice !== null ? (
              <div className="space-y-1">
                {!manualPrice &&
                  basePrice !== null &&
                  totalDiscount > 0 &&
                  basePrice !== displayPrice && (
                    <div className="text-sm text-muted-foreground line-through">
                      {formatCurrency(basePrice)}
                    </div>
                  )}
                <div className="text-2xl font-bold">
                  {formatCurrency(displayPrice)}
                </div>
                {!manualPrice && totalDiscount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    割引 -{formatCurrency(totalDiscount)} 適用
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                スペースと時間を選択すると料金が自動計算されます
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="manualPrice">手動で料金を調整</Label>
              <Input
                id="manualPrice"
                type="number"
                value={manualPrice ?? ""}
                onChange={(e) =>
                  setManualPrice(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                placeholder="手動で料金を入力（任意）"
                disabled={isPending}
              />
              <p className="text-sm text-muted-foreground">
                割引や追加料金がある場合に手動で調整できます
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.couponCode.id}>クーポンコード</Label>
              <Input
                {...getInputProps(fields.couponCode, { type: "text" })}
                placeholder="クーポンコードを入力（任意）"
                disabled={isPending}
              />
              {fields.couponCode.errors && (
                <p
                  id={fields.couponCode.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.couponCode.errors.join(", ")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 右カラム: 顧客情報 + 追加設定 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>顧客情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <IconUser
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <Link
                    href={`/admin/customers/${reservation.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {reservation.customer.lastName}{" "}
                    {reservation.customer.firstName}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <IconMail
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="text-sm text-muted-foreground">
                    {reservation.customer.email}
                  </span>
                </div>
                {reservation.customer.phoneNumber && (
                  <div className="flex items-center gap-2">
                    <IconPhone
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                    <span className="text-sm text-muted-foreground">
                      {reservation.customer.phoneNumber}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>追加設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>予約ステータス</Label>
                <SelectionBox
                  options={getStatusOptionsForCurrent(reservation.status)}
                  value={status}
                  onChange={(value) => {
                    if (isValidReservationStatus(value)) setStatus(value);
                  }}
                  columns={3}
                  disabled={isPending}
                  name="予約ステータス"
                />
                {fields.status.errors && (
                  <p
                    id={fields.status.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.status.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.notes.id}>メモ</Label>
                <Textarea
                  {...getInputProps(fields.notes, { type: "text" })}
                  placeholder="例: 電話予約、紹介（山田様）"
                  disabled={isPending}
                  rows={3}
                />
                {fields.notes.errors && (
                  <p
                    id={fields.notes.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.notes.errors.join(", ")}
                  </p>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                スペース・日時・料金の変更を保存すると、自動的にお客様と管理者へ
                変更通知メールが送信されます。キャンセル・完了・無断キャンセルへの
                変更は、予約詳細画面のステータス変更から行ってください。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <SubmitButton
          isPending={isPending}
          label="予約を更新"
          pendingLabel="更新中..."
        />
      </div>
    </form>
  );
}
