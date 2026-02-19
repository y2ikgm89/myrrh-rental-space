"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CalendarIcon } from "lucide-react";
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
} from "@/admin/components/ui";
import {
  updateReservationSchema,
  type UpdateReservationInput,
} from "@/admin/lib/validations/admin-reservation";
import { updateAdminReservation } from "@/admin/actions/reservation";
import { formatCurrency } from "@/shared/lib/utils";
import {
  ReservationStatus,
  isValidReservationStatus,
} from "@/shared/lib/validations/enums";
import { CustomerSelector } from "./CustomerSelector";
import type { ReservationWithRelations } from "@/admin/actions/reservation";

// =============================================================================
// Types
// =============================================================================

type SpaceOption = {
  id: string;
  name: string;
  hourlyPrice: number;
};

type ReservationEditFormProps = {
  reservation: ReservationWithRelations;
  spaces: SpaceOption[];
};

// =============================================================================
// Helpers
// =============================================================================

/** ISO 8601 文字列 または Date → YYYY-MM-DD（ローカルタイムゾーン） */
function toLocalDateString(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 8601 文字列 または Date → HH:MM（ローカルタイムゾーン） */
function toLocalTimeString(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

// =============================================================================
// Constants
// =============================================================================

const RESERVATION_STATUS_OPTIONS = [
  {
    value: ReservationStatus.CONFIRMED,
    label: "確定",
    description: "予約が確定済み",
  },
  { value: ReservationStatus.PENDING, label: "保留", description: "確認待ち" },
  {
    value: ReservationStatus.CANCELLED,
    label: "キャンセル",
    description: "予約をキャンセル",
  },
];

// 時間オプション（9:00-21:00、1時間刻み）
const TIME_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});

// =============================================================================
// Main Component
// =============================================================================

export function ReservationEditForm({
  reservation,
  spaces,
}: ReservationEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined);

  // CustomerSelector用の状態（常に既存顧客モードのみ）
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>({
    id: reservation.customer.id,
    name: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    email: reservation.customer.email,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<UpdateReservationInput>({
    resolver: zodResolver(updateReservationSchema),
    defaultValues: {
      spaceId: reservation.spaceId,
      date: toLocalDateString(reservation.startTime),
      startTime: toLocalTimeString(reservation.startTime),
      endTime: toLocalTimeString(reservation.endTime),
      customerId: reservation.customerId,
      couponCode: reservation.coupon?.code ?? "",
      status: reservation.status,
      notes: reservation.notes ?? "",
      sendNotificationEmail: false,
    },
  });

  const spaceId = useWatch({ control, name: "spaceId" });
  const date = useWatch({ control, name: "date" });
  const startTime = useWatch({ control, name: "startTime" });
  const endTime = useWatch({ control, name: "endTime" });
  const status = useWatch({ control, name: "status" });
  const sendNotificationEmail = useWatch({
    control,
    name: "sendNotificationEmail",
  });

  // 選択されたスペース情報
  const selectedSpace = spaces.find((s) => s.id === spaceId);

  // 料金自動計算
  const calculatedPrice = (() => {
    if (!selectedSpace || !startTime || !endTime) return null;
    try {
      const start = new Date(`${date || "2000-01-01"}T${startTime}`);
      const end = new Date(`${date || "2000-01-01"}T${endTime}`);
      if (end <= start) return null;
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return selectedSpace.hourlyPrice * hours;
    } catch {
      return null;
    }
  })();

  const displayPrice = manualPrice ?? calculatedPrice;

  // CustomerSelector ハンドラー（編集では既存顧客のみ）
  const handleSelectCustomer = (
    customer: { id: string; name: string; email: string } | null,
  ) => {
    setSelectedCustomer(customer);
    setValue("customerId", customer?.id ?? "");
  };

  const onSubmit = async (data: UpdateReservationInput) => {
    startTransition(async () => {
      const submitData: UpdateReservationInput = {
        ...data,
        totalPrice: manualPrice,
      };

      const result = await updateAdminReservation(reservation.id, submitData);
      if (result.success) {
        toast.success(result.message);
        router.push(`/admin/reservations/${reservation.id}`);
      } else {
        toast.error(result.error || "予約の更新に失敗しました");
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, messages]) => {
            if (Array.isArray(messages)) {
              messages.forEach((message: string) =>
                toast.error(`${field}: ${message}`),
              );
            }
          });
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: スペース・日時・料金 */}
        <div className="space-y-6">
          {/* スペース選択 */}
          <Card>
            <CardHeader>
              <CardTitle>スペース選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spaceId">スペース *</Label>
                <Select
                  value={spaceId || ""}
                  onValueChange={(value) => setValue("spaceId", value)}
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
                {errors.spaceId && (
                  <p className="text-sm text-destructive">
                    {errors.spaceId.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 日時選択 */}
          <Card>
            <CardHeader>
              <CardTitle>日時選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date">日付 *</Label>
                <div className="relative">
                  <Input
                    id="date"
                    type="date"
                    {...register("date")}
                    disabled={isPending}
                    className="pr-10"
                  />
                  <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {errors.date && (
                  <p className="text-sm text-destructive">
                    {errors.date.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">開始時間 *</Label>
                  <Select
                    value={startTime || ""}
                    onValueChange={(value) => setValue("startTime", value)}
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
                  {errors.startTime && (
                    <p className="text-sm text-destructive">
                      {errors.startTime.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">終了時間 *</Label>
                  <Select
                    value={endTime || ""}
                    onValueChange={(value) => setValue("endTime", value)}
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
                  {errors.endTime && (
                    <p className="text-sm text-destructive">
                      {errors.endTime.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 料金 */}
          <Card>
            <CardHeader>
              <CardTitle>料金</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayPrice !== null ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold">
                    {formatCurrency(displayPrice)}
                  </div>
                  {!manualPrice &&
                    calculatedPrice !== null &&
                    selectedSpace && (
                      <p className="text-sm text-muted-foreground">
                        自動計算: {formatCurrency(selectedSpace.hourlyPrice)}
                        /時間 ×{" "}
                        {((calculatedPrice / selectedSpace.hourlyPrice) * 10) /
                          10}
                        時間
                      </p>
                    )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  スペースと時間を選択してください
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
            </CardContent>
          </Card>

          {/* クーポン */}
          <Card>
            <CardHeader>
              <CardTitle>クーポン</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="couponCode">クーポンコード</Label>
                <Input
                  id="couponCode"
                  type="text"
                  {...register("couponCode")}
                  placeholder="クーポンコードを入力（任意）"
                  disabled={isPending}
                />
                {errors.couponCode && (
                  <p className="text-sm text-destructive">
                    {errors.couponCode.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: 顧客情報 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>顧客情報</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerSelector
                selectedCustomer={selectedCustomer}
                onSelectCustomer={handleSelectCustomer}
                onNewCustomerData={() => {}}
                isNewCustomer={false}
                onToggleNewCustomer={() => {}}
                allowNewCustomer={false}
              />
              {errors.customerId && (
                <p className="mt-2 text-sm text-destructive">
                  {errors.customerId.message}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 下部: ステータス・メモ・通知設定 */}
      <Card>
        <CardHeader>
          <CardTitle>追加設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>予約ステータス</Label>
            <SelectionBox
              options={RESERVATION_STATUS_OPTIONS}
              value={status ?? ReservationStatus.CONFIRMED}
              onChange={(value) => {
                if (isValidReservationStatus(value)) setValue("status", value);
              }}
              columns={3}
              disabled={isPending}
              name="予約ステータス"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder="例: 電話予約、紹介（山田様）"
              disabled={isPending}
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sendNotificationEmail"
              checked={sendNotificationEmail}
              onCheckedChange={(checked) =>
                setValue("sendNotificationEmail", checked === true)
              }
              disabled={isPending}
            />
            <Label htmlFor="sendNotificationEmail" className="cursor-pointer">
              変更内容を顧客にメール通知する
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ボタン */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "更新中..." : "予約を更新"}
        </Button>
      </div>
    </form>
  );
}
