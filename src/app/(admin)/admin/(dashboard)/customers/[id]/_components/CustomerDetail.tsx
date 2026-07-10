"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatDateShort,
  formatDateTimeShort,
  formatTimeShort,
} from "@/shared/lib/date-format";
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
  CustomerIdentityBadge,
  CustomerStatusBadge,
  ReservationStatusBadge,
} from "@/admin/components/status-badges";
import {
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
  clearCustomerRiskFlag,
} from "@/admin/actions/customer";
import type { CustomerWithReservationsAndAccount } from "@/shared/domain/customers/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCustomerStatus } from "@/shared/lib/validations/enums/guards";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  getRiskFlagReasonLabel,
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

  const handleClearRiskFlag = async () => {
    startTransition(async () => {
      const result = await clearCustomerRiskFlag(customer.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("要注意フラグを解除しました");
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
            <DetailField
              label="顧客ID状態"
              value={<CustomerIdentityBadge userId={customer.userId} />}
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
            <div className="space-y-1">
              <p className="text-sm font-medium">ゲスト未リンク</p>
              <p className="text-sm text-muted-foreground">
                メールアドレスが一致しても会員アカウントへは自動連携されません。
              </p>
            </div>
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
                        {formatTimeShort(reservation.endTime)}
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

        {/* 要注意フラグ（customer-risk-scan cronが検知した場合のみ表示） */}
        {customer.flaggedForReviewAt ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">要注意</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {formatDateShort(customer.flaggedForReviewAt)} に不審な予約
                パターンを検知しました。自動的にステータスは変更していません
                （最終判断はこの画面で行ってください）。
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {customer.flagReasons.map((reason) => (
                  <li key={reason}>{getRiskFlagReasonLabel(reason)}</li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearRiskFlag}
                disabled={isPending}
                className="w-full"
              >
                誤検知として解除
              </Button>
            </CardContent>
          </Card>
        ) : null}

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
