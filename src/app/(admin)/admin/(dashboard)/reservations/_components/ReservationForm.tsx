"use client";

import { useActionState, useState } from "react";
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
import { createReservationAction } from "@/admin/actions/reservation";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
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

export function ReservationForm({ spaces }: ReservationFormProps) {
  const router = useRouter();
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined);

  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [newCustomerData, setNewCustomerData] =
    useState<NewCustomerData>(EMPTY_NEW_CUSTOMER);

  const [spaceId, setSpaceId] = useState<string>("");
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

  const selectedSpace = spaces.find((s) => s.id === spaceId);

  const calculatedPrice = (() => {
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
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return selectedSpace.hourlyPrice * hours;
  })();

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
      {/* spaceId / startTime / endTime / status / sendEmail hidden inputs */}
      <input type="hidden" name={fields.spaceId.name} value={spaceId} />
      <input type="hidden" name={fields.startTime.name} value={startTime} />
      <input type="hidden" name={fields.endTime.name} value={endTime} />
      <input type="hidden" name={fields.status.name} value={status} />
      <input
        type="hidden"
        name={fields.sendEmail.name}
        value={sendEmail ? "on" : ""}
      />

      {form.errors && form.errors.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
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
                <div className="text-2xl font-bold">
                  {formatCurrency(displayPrice)}
                </div>
                {!manualPrice && calculatedPrice !== null && selectedSpace && (
                  <p className="text-sm text-muted-foreground">
                    自動計算: {formatCurrency(selectedSpace.hourlyPrice)}/時間 ×{" "}
                    {((calculatedPrice / selectedSpace.hourlyPrice) * 10) / 10}
                    時間
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
