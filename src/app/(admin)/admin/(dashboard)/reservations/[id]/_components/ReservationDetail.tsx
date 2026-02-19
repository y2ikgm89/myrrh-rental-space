"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
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
import { ReservationStatusBadge } from "@/admin/components/status-badges";
import {
  updateReservationStatus,
  updateReservationNotes,
} from "@/admin/actions/reservation";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import {
  isValidReservationStatus,
  type ReservationStatus,
} from "@/shared/lib/validations/enums";
import { formatDateTimeFull, formatPrice } from "@/shared/lib/utils";

type ReservationDetailProps = {
  reservation: ReservationWithRelations;
};

export function ReservationDetail({ reservation }: ReservationDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(reservation.notes || "");

  const handleStatusChange = async (newStatus: ReservationStatus) => {
    if (newStatus === reservation.status) return;

    startTransition(async () => {
      const result = await updateReservationStatus(reservation.id, newStatus);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    });
  };

  const handleNotesUpdate = async () => {
    startTransition(async () => {
      const result = await updateReservationNotes(
        reservation.id,
        notes || null,
      );
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    });
  };

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
              <SelectTrigger className="w-48">
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">保留中に変更</SelectItem>
                <SelectItem value="CONFIRMED">確認済みに変更</SelectItem>
                <SelectItem value="CANCELLED">キャンセルに変更</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 予約情報 */}
      <Card>
        <CardHeader>
          <CardTitle>予約情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">スペース</div>
              <div className="font-medium">{reservation.space.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">料金</div>
              <div className="font-medium">
                {formatPrice(reservation.totalPrice)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">開始日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.startTime)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">終了日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.endTime)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">作成日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">更新日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.updatedAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 顧客情報 */}
      <Card>
        <CardHeader>
          <CardTitle>顧客情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">氏名</div>
              <div className="font-medium">
                {reservation.customer.lastName} {reservation.customer.firstName}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                メールアドレス
              </div>
              <div className="font-medium">{reservation.customer.email}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">電話番号</div>
              <div className="font-medium">
                {reservation.customer.phoneNumber || "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
