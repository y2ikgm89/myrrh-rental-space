"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateShort, formatDateTimeShort } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
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
import type { CustomerWithReservationsAndAccount } from "@/shared/domain/customers/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCustomerStatus } from "@/shared/lib/validations/enums/guards";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

type CustomerDetailProps = {
  customer: CustomerWithReservationsAndAccount;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  line: "LINE",
  credential: "メール/パスワード",
};

const ALL_PROVIDERS = ["google", "line"] as const;

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
              label="区分"
              value={CUSTOMER_TYPE_LABELS[customer.customerType]}
            />
            {customer.companyName ? (
              <DetailField
                label="会社名・団体名"
                value={customer.companyName}
              />
            ) : null}
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
            <DetailField label="郵便番号" value={customer.postalCode} />
            <DetailField label="都道府県" value={customer.prefecture} />
            <DetailField label="市区町村" value={customer.city} />
            <DetailField label="町名・番地" value={customer.streetAddress} />
            <DetailField label="建物名・部屋番号" value={customer.building} />
            <DetailField
              label="メルマガ受信"
              value={customer.marketingOptIn ? "可" : "不可"}
            />
            <DetailField
              label="電話連絡"
              value={customer.phoneContactOptIn ? "可" : "不可"}
            />
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

        <DetailSection title="アカウント連携">
          {customer.user === null ? (
            <p className="text-sm text-muted-foreground">未連携</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {ALL_PROVIDERS.map((provider) => {
                const linked = customer.user?.accounts.some(
                  (account) => account.provider === provider,
                );
                return (
                  <DetailField
                    key={provider}
                    label={PROVIDER_LABELS[provider] ?? provider}
                    value={
                      <span
                        className={
                          linked ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {linked ? "連携済み" : "未連携"}
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
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
                {entriesOf(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
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
