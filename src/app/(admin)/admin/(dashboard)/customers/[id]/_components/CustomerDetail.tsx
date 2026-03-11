"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatDateShort,
  formatDateTimeShort,
  formatPrice,
} from "@/shared/lib/utils";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Switch,
  Label,
} from "@/admin/components/ui";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import {
  CustomerStatusBadge,
  ReservationStatusBadge,
} from "@/admin/components/status-badges";
import {
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
} from "@/admin/actions/customer";
import type { CustomerWithReservations } from "@/shared/domain/customers/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  isValidCustomerStatus,
  type CustomerStatus,
} from "@/shared/lib/validations/enums";

type CustomerDetailProps = {
  customer: CustomerWithReservations;
};

export function CustomerDetail({ customer }: CustomerDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(customer.notes || "");

  const handleStatusChange = async (status: CustomerStatus) => {
    startTransition(async () => {
      const result = await updateCustomerStatus(customer.id, status);
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
      const result = await updateCustomerNotes(customer.id, notes || null);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("メモを更新しました");
      router.refresh();
    });
  };

  const handleToggleActive = async () => {
    startTransition(async () => {
      const result = await toggleCustomerActive(customer.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("アクティブ状態を変更しました");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* 顧客情報 */}
      <div className="md:col-span-2 space-y-6">
        <DetailSection title="基本情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="お名前"
              value={`${customer.lastName} ${customer.firstName}`}
            />
            <DetailField
              label="メールアドレス"
              value={
                <a
                  href={`mailto:${customer.email}`}
                  className="text-primary hover:underline"
                >
                  {customer.email}
                </a>
              }
            />
            <DetailField label="電話番号" value={customer.phoneNumber} />
            <DetailField label="住所" value={customer.address} />
          </div>
        </DetailSection>

        <DetailSection title="統計情報">
          <div className="grid gap-4 sm:grid-cols-3">
            <DetailField
              label="予約回数"
              value={
                <span className="text-2xl font-bold">
                  {customer.totalReservations}
                </span>
              }
            />
            <DetailField
              label="累計利用金額"
              value={
                <span className="text-2xl font-bold">
                  {formatPrice(customer.totalSpent, "-")}
                </span>
              }
            />
            <DetailField
              label="最終予約日"
              value={
                <span className="text-lg">
                  {formatDateShort(customer.lastReservationAt)}
                </span>
              }
            />
          </div>
        </DetailSection>

        {/* 予約履歴 */}
        <Card>
          <CardHeader>
            <CardTitle>予約履歴（最新20件）</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.reservations.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                予約履歴がありません
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>スペース</TableHead>
                    <TableHead>日時</TableHead>
                    <TableHead>金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.reservations.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell className="font-medium">
                        {reservation.space.name}
                      </TableCell>
                      <TableCell>
                        {formatDateTimeShort(reservation.startTime)}
                        {" - "}
                        {new Date(reservation.endTime).toLocaleTimeString(
                          "ja-JP",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </TableCell>
                      <TableCell>
                        {formatPrice(reservation.totalPrice, "-")}
                      </TableCell>
                      <TableCell>
                        <ReservationStatusBadge status={reservation.status} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/reservations/${reservation.id}`}>
                            詳細
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* サイドバー */}
      <div className="space-y-6">
        {/* ステータス */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">現在:</span>
              <CustomerStatusBadge status={customer.status} />
            </div>
            <Select
              value={customer.status}
              onValueChange={(value) => {
                if (isValidCustomerStatus(value)) handleStatusChange(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">新規</SelectItem>
                <SelectItem value="REGULAR">リピーター</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="INACTIVE">休眠</SelectItem>
                <SelectItem value="BLACKLIST">ブラックリスト</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between pt-2 border-t">
              <Label htmlFor="isActive">アクティブ</Label>
              <Switch
                id="isActive"
                checked={customer.isActive}
                onCheckedChange={handleToggleActive}
                disabled={isPending}
              />
            </div>
          </CardContent>
        </Card>

        {/* メモ */}
        <Card>
          <CardHeader>
            <CardTitle>メモ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="顧客に関するメモ..."
              rows={5}
              disabled={isPending}
            />
            <SubmitButton
              isPending={isPending}
              onClick={handleNotesUpdate}
              label="メモを保存"
              pendingLabel="保存中..."
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* アクション */}
        <Card>
          <CardHeader>
            <CardTitle>アクション</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href={`mailto:${customer.email}`}>メールを送信</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
