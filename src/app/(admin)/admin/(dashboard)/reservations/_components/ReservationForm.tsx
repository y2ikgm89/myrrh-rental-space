"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import { useRouter } from "next/navigation";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconCalendar } from "@tabler/icons-react";
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
  Checkbox,
  SelectionBox,
  SubmitButton,
} from "@/admin/components/ui";
import {
  createReservationAction,
  previewReservationPricingAction,
} from "@/admin/actions/reservation";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import type { ReservationPricingResult } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { CustomerSelector } from "./CustomerSelector";
import {
  RESERVATION_STATUS_OPTIONS,
  TIME_OPTIONS,
  type SpaceOption,
  type SelectedCustomer,
  type NewCustomerData,
} from "./reservation-form-helpers";
import { createReservationFormSchema } from "./reservation-form-schema";

type ReservationFormProps = {
  spaces: SpaceOption[];
};

const EMPTY_NEW_CUSTOMER: NewCustomerData = {
  lastName: "",
  firstName: "",
  email: "",
};

type PricingWindow = { spaceId: string; startIso: string; endIso: string };

/**
 * spaceId・日付・開始/終了時刻から料金プレビュー用の JST 日時範囲を解決する。
 * 入力が揃っていない・不正な範囲（終了 <= 開始 等）の場合は null。
 *
 * render 内の呼出し結果を `useEffect` の依存配列にそのまま使うため、
 * ここで null を返すことで「まだ計算できない」を synchronous に表現する
 * （effect 内で setState(null) を呼ぶ react-hooks/set-state-in-effect 違反を避ける）。
 */
function resolvePricingWindow(
  spaceId: string,
  date: string,
  startTime: string,
  endTime: string,
): PricingWindow | null {
  if (!spaceId || !date || !startTime || !endTime) return null;
  const start = parseDateTimeLocalAsJst(`${date}T${startTime}`);
  const end = parseDateTimeLocalAsJst(`${date}T${endTime}`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return null;
  }
  return { spaceId, startIso: start.toISOString(), endIso: end.toISOString() };
}

export function ReservationForm({ spaces }: ReservationFormProps) {
  const router = useRouter();
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined);

  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [newCustomerData, setNewCustomerData] =
    useState<NewCustomerData>(EMPTY_NEW_CUSTOMER);

  const [spaceId, setSpaceId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [status, setStatus] = useState<ReservationStatus>(
    ReservationStatus.CONFIRMED,
  );
  const [sendEmail, setSendEmail] = useState<boolean>(true);

  const [lastResult, action, isPending] = useActionState(
    createReservationAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: "reservation-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createReservationFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const customerFields = fields.customerData.getFieldset();

  const handleSelectCustomer = (customer: SelectedCustomer | null) => {
    setSelectedCustomer(customer);
  };

  const handleNewCustomerData = (data: NewCustomerData | null) => {
    setNewCustomerData(data ?? EMPTY_NEW_CUSTOMER);
  };

  const handleToggleNewCustomer = (isNew: boolean) => {
    setIsNewCustomer(isNew);
    if (isNew) {
      setSelectedCustomer(null);
    } else {
      setNewCustomerData(EMPTY_NEW_CUSTOMER);
    }
  };

  const [pricePreview, setPricePreview] =
    useState<ReservationPricingResult | null>(null);
  const [, startPricingTransition] = useTransition();

  const pricingWindow = resolvePricingWindow(spaceId, date, startTime, endTime);

  // 料金プレビューはサーバー側 createAdminReservationCommand と同じ
  // calculateReservationPricing を Server Action 経由で呼び出す SSoT（Task 13）。
  // rate plan・祝日判定は client から Prisma に触れずには計算できないため、
  // スペース・日時が揃うたびにサーバーへ問い合わせる。クーポンはサーバー側で
  // 検証・適用されるため preview には含めない（手動 totalPrice 上書きで調整可能）。
  useEffect(() => {
    if (!pricingWindow) return;
    const { spaceId: previewSpaceId, startIso, endIso } = pricingWindow;
    startPricingTransition(async () => {
      const result = await previewReservationPricingAction(
        previewSpaceId,
        startIso,
        endIso,
      );
      setPricePreview(result);
    });
  }, [pricingWindow]);

  const calculatedPrice = pricingWindow
    ? (pricePreview?.totalPrice ?? null)
    : null;
  const basePrice = pricingWindow ? (pricePreview?.basePrice ?? null) : null;
  const totalDiscount = pricingWindow
    ? (pricePreview?.spaceDiscountAmount ?? 0) +
      (pricePreview?.durationDiscountAmount ?? 0)
    : 0;
  const displayPrice = manualPrice ?? calculatedPrice;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* Mode + customerId hidden inputs */}
      <input
        type="hidden"
        name={fields.mode.name}
        value={isNewCustomer ? "new" : "existing"}
      />
      <input
        type="hidden"
        name={fields.customerId.name}
        value={selectedCustomer?.id ?? ""}
      />
      {/* CustomerData nested hidden inputs (new customer mode) */}
      {isNewCustomer && (
        <>
          <input
            type="hidden"
            name={customerFields.lastName.name}
            value={newCustomerData.lastName}
          />
          <input
            type="hidden"
            name={customerFields.firstName.name}
            value={newCustomerData.firstName}
          />
          <input
            type="hidden"
            name={customerFields.email.name}
            value={newCustomerData.email}
          />
          <input
            type="hidden"
            name={customerFields.companyName.name}
            value={newCustomerData.companyName ?? ""}
          />
          <input
            type="hidden"
            name={customerFields.phoneNumber.name}
            value={newCustomerData.phoneNumber ?? ""}
          />
        </>
      )}
      {/* totalPrice hidden input (manual override) */}
      <input
        type="hidden"
        name={fields.totalPrice.name}
        value={manualPrice ?? ""}
      />
      {/* spaceId / date / startTime / endTime / status / sendEmail hidden inputs */}
      <input type="hidden" name={fields.spaceId.name} value={spaceId} />
      <input type="hidden" name={fields.date.name} value={date} />
      <input type="hidden" name={fields.startTime.name} value={startTime} />
      <input type="hidden" name={fields.endTime.name} value={endTime} />
      <input type="hidden" name={fields.status.name} value={status} />
      <input
        type="hidden"
        name={fields.sendEmail.name}
        value={sendEmail ? "on" : ""}
      />

      {form.errors && form.errors.length > 0 && (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {form.errors.join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: 予約情報（スペース・日時・料金） */}
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
                <SelectTrigger
                  id="spaceId"
                  aria-invalid={fields.spaceId.errors ? true : undefined}
                  aria-describedby={
                    fields.spaceId.errors ? fields.spaceId.errorId : undefined
                  }
                >
                  <SelectValue placeholder="スペースを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.name}
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
                  id={fields.date.id}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={isPending}
                  className="pr-10"
                  aria-invalid={fields.date.errors ? true : undefined}
                  aria-describedby={
                    fields.date.errors ? fields.date.errorId : undefined
                  }
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
                  <SelectTrigger
                    id="startTime"
                    aria-invalid={fields.startTime.errors ? true : undefined}
                    aria-describedby={
                      fields.startTime.errors
                        ? fields.startTime.errorId
                        : undefined
                    }
                  >
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
                  <SelectTrigger
                    id="endTime"
                    aria-invalid={fields.endTime.errors ? true : undefined}
                    aria-describedby={
                      fields.endTime.errors ? fields.endTime.errorId : undefined
                    }
                  >
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
              <CustomerSelector
                selectedCustomer={selectedCustomer}
                onSelectCustomer={handleSelectCustomer}
                onNewCustomerData={handleNewCustomerData}
                isNewCustomer={isNewCustomer}
                onToggleNewCustomer={handleToggleNewCustomer}
                errors={{
                  lastName: customerFields.lastName.errors,
                  firstName: customerFields.firstName.errors,
                  email: customerFields.email.errors,
                  phoneNumber: customerFields.phoneNumber.errors,
                  companyName: customerFields.companyName.errors,
                }}
                ariaDescribedBy={
                  fields.customerId.errors
                    ? fields.customerId.errorId
                    : undefined
                }
              />
              {fields.customerId.errors && (
                <p
                  id={fields.customerId.errorId}
                  className="mt-2 text-sm text-destructive"
                >
                  {fields.customerId.errors.join(", ")}
                </p>
              )}
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
                  options={RESERVATION_STATUS_OPTIONS}
                  value={status}
                  onChange={(value) => {
                    if (isValidReservationStatus(value)) setStatus(value);
                  }}
                  columns={2}
                  disabled={isPending}
                  name="予約ステータス"
                  ariaDescribedBy={
                    fields.status.errors ? fields.status.errorId : undefined
                  }
                />
                <p className="text-sm text-muted-foreground">
                  電話予約の場合は「確定」を推奨します
                </p>
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

              <div className="flex items-center gap-2">
                <Checkbox
                  id="sendEmail"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                  disabled={isPending}
                />
                <Label htmlFor="sendEmail" className="cursor-pointer">
                  予約確認メールを顧客に送信する
                </Label>
              </div>
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
          label="予約を作成"
          pendingLabel="作成中..."
        />
      </div>
    </form>
  );
}
