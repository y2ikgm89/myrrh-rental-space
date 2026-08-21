"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button } from "@/admin/components/ui";
import { DetailField } from "@/admin/components/DetailField";
import { DetailSection } from "@/admin/components/DetailSection";
import {
  reissueReservationReceipt,
  reissueEventRegistrationReceipt,
} from "@/admin/actions/receipt";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatDateTimeFull } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { ReceiptReissueDialog } from "./ReceiptReissueDialog";
import { ReceiptRevisionChain } from "./ReceiptRevisionChain";

type ReceiptCustomer = {
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
};

type ReceiptDetailViewProps = {
  readonly receipt: {
    readonly id: string;
    readonly serialNo: string;
    readonly issuedAt: string;
    readonly usedAt: string | null;
    readonly recipientName: string;
    readonly subject: string;
    readonly amount: number;
    readonly taxAmount: number;
    readonly taxRate: number;
    readonly revision: number;
    readonly reissuedReason: string | null;
    readonly reservationId: string | null;
    readonly eventRegistrationId: string | null;
    readonly reservationCustomer: ReceiptCustomer | null;
    readonly eventRegistrationCustomer: ReceiptCustomer | null;
    readonly reissuedTo: ReadonlyArray<{
      readonly id: string;
      readonly serialNo: string;
      readonly revision: number;
      readonly issuedAt: string;
    }>;
  };
  readonly upChain: ReadonlyArray<{
    readonly id: string;
    readonly serialNo: string;
    readonly revision: number;
    readonly issuedAt: string;
  }>;
};

export function ReceiptDetailView({
  receipt,
  upChain,
}: ReceiptDetailViewProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInstance, setDialogInstance] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Receipt が既に再発行済 (reissuedTo が存在) なら orphan 化されている (reservationId /
  // eventRegistrationId は NULL)。orphan は再発行不可 (chain の分岐禁止)。
  const hasDownChain = receipt.reissuedTo.length > 0;
  const isOrphaned =
    receipt.reservationId === null && receipt.eventRegistrationId === null;
  const canReissue = !isOrphaned && !hasDownChain;

  const openDialog = () => {
    setDialogInstance((n) => n + 1);
    setDialogOpen(true);
  };

  const handleConfirmReissue = (reason: string) => {
    startTransition(async () => {
      const result =
        receipt.reservationId !== null
          ? await reissueReservationReceipt(
              receipt.reservationId,
              receipt.id,
              reason,
            )
          : receipt.eventRegistrationId !== null
            ? await reissueEventRegistrationReceipt(
                receipt.eventRegistrationId,
                receipt.id,
                reason,
              )
            : null;

      if (result === null) {
        toast.error(
          "領収書の発行元 (予約 / イベント申込) を特定できません。既に再発行済みの可能性があります。",
        );
        return;
      }

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`領収書を再発行しました (No. ${result.serialNo})`);
      setDialogOpen(false);
      // 新 serialNo の詳細ページへ遷移 (現ページは orphan 化されるため)
      router.push(toAppRoute(`/admin/receipts/${result.serialNo}`));
      router.refresh();
    });
  };

  const customer =
    receipt.reservationCustomer ?? receipt.eventRegistrationCustomer;
  const relatedLink =
    receipt.reservationId !== null
      ? {
          href: toAppRoute(`/admin/reservations/${receipt.reservationId}`),
          label: "予約詳細を開く",
        }
      : null;

  return (
    <div className="space-y-6">
      <DetailSection title="領収書">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="領収書番号"
            value={<span className="font-mono">{receipt.serialNo}</span>}
          />
          <DetailField
            label="訂正回数 (revision)"
            value={
              receipt.revision === 0 ? "0 (初発行)" : `rev.${receipt.revision}`
            }
          />
          <DetailField
            label="発行日時"
            value={formatDateTimeFull(receipt.issuedAt)}
          />
          <DetailField
            label="使用状況 (ダウンロード済み)"
            value={
              receipt.usedAt !== null ? (
                <span className="inline-flex items-center gap-2">
                  <Badge variant="secondary">使用済み</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTimeFull(receipt.usedAt)}
                  </span>
                </span>
              ) : (
                <Badge variant="outline">未使用</Badge>
              )
            }
          />
          <DetailField label="宛名" value={receipt.recipientName} />
          <DetailField label="但し書き" value={receipt.subject} />
          <DetailField
            label="金額 (税込)"
            value={formatPrice(receipt.amount)}
          />
          <DetailField
            label="うち消費税"
            value={`${formatPrice(receipt.taxAmount)} (${receipt.taxRate}%)`}
          />
          {receipt.reissuedReason !== null && (
            <DetailField
              label="再発行理由"
              value={
                <p className="whitespace-pre-wrap text-sm">
                  {receipt.reissuedReason}
                </p>
              }
              className="sm:col-span-2"
            />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canReissue || isPending}
            onClick={openDialog}
            title={
              isOrphaned
                ? "この領収書は既に再発行済で無効化されています"
                : hasDownChain
                  ? "この領収書は既に再発行チェーンに新しい版があります"
                  : undefined
            }
          >
            {isPending ? "処理中..." : "領収書を再発行"}
          </Button>
          {relatedLink !== null && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={relatedLink.href}>{relatedLink.label}</Link>
            </Button>
          )}
          {isOrphaned && (
            <p className="text-xs text-muted-foreground">
              この領収書は再発行済で発行対象 (予約 / イベント申込)
              から外れています。 監査証跡としてのみ参照可能です。
            </p>
          )}
        </div>
      </DetailSection>

      {customer !== null && (
        <DetailSection title="発行先 (顧客情報)">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="氏名"
              value={`${customer.lastName} ${customer.firstName}`}
            />
            <DetailField label="メール" value={customer.email} />
          </div>
        </DetailSection>
      )}

      <DetailSection title="訂正 (再発行) チェーン">
        <ReceiptRevisionChain
          current={{
            id: receipt.id,
            serialNo: receipt.serialNo,
            revision: receipt.revision,
            issuedAt: receipt.issuedAt,
            isOrphaned,
          }}
          upChain={upChain}
          downChain={receipt.reissuedTo}
        />
      </DetailSection>

      <ReceiptReissueDialog
        key={`reissue-${dialogInstance}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentSerialNo={receipt.serialNo}
        currentRevision={receipt.revision}
        onConfirm={handleConfirmReissue}
        isPending={isPending}
      />
    </div>
  );
}
