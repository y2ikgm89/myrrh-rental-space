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
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
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
      <DetailSection title="予約情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース" value={reservation.space.name} />
          <DetailField
            label="料金"
            value={formatPrice(reservation.totalPrice)}
          />
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

      {/* 顧客情報 */}
      <DetailSection title="顧客情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="氏名"
            value={`${reservation.customer.lastName} ${reservation.customer.firstName}`}
          />
          <DetailField
            label="メールアドレス"
            value={reservation.customer.email}
          />
          <DetailField
            label="電話番号"
            value={reservation.customer.phoneNumber || "-"}
          />
        </div>
      </DetailSection>

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
