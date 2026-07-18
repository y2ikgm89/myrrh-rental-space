import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getReceiptDetailBySerialNo } from "@/admin/queries/receipt";
import { ReceiptDetailView } from "./_components/ReceiptDetailView";

type Params = Promise<{ serialNo: string }>;

type PageProps = {
  params: Params;
};

/**
 * 領収書詳細ページ (RECEIPT-USEDAT-P2)。
 *
 * ## スコープ
 * - Reservation / EventRegistration 詳細ページからのリンク in で開く detail-only ページ
 * - 一覧 (`/admin/receipts`) は今回作らない (minimal-scope 方針、監査ログ経由で全件参照可能)
 * - `Receipt.usedAt` (Phase 1 で追加) を「使用済み / 未使用」pill として可視化
 * - 訂正 chain (`reissuedFromId` / `reissuedTo`) を breadcrumb 状に表示
 * - reissue button + acknowledgement checkbox 付き dialog
 *
 * ## Guest resend policy (Phase 2 決定)
 * strict single-use を主防御としているため、ゲスト向けセルフサービス再送 URL は
 * 実装しない (自己再送を許すと token 交換で無制限 DL 可となり single-use の意味が失われる)。
 * 保存忘れは管理者経由の reissue で対応 (customer には新確認メールが自動送信される)。
 */

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { serialNo } = await params;
  return {
    title: `領収書詳細: ${serialNo} | Myrrh Rental Space`,
  };
}

export default async function ReceiptDetailPage({ params }: PageProps) {
  await connection();

  const { serialNo } = await params;
  const detail = await getReceiptDetailBySerialNo(serialNo);

  if (!detail) {
    notFound();
  }

  const { receipt, upChain } = detail;

  return (
    <AdminDetailLayout
      backHref="/admin"
      title={`領収書 No. ${receipt.serialNo}`}
      subtitle={
        receipt.revision === 0 ? "初発行" : `訂正 rev.${receipt.revision}`
      }
    >
      <ReceiptDetailView
        receipt={{
          id: receipt.id,
          serialNo: receipt.serialNo,
          issuedAt: receipt.issuedAt.toISOString(),
          usedAt: receipt.usedAt?.toISOString() ?? null,
          recipientName: receipt.recipientName,
          subject: receipt.subject,
          amount: receipt.amount,
          taxAmount: receipt.taxAmount,
          taxRate: receipt.taxRate,
          revision: receipt.revision,
          reissuedReason: receipt.reissuedReason,
          reservationId: receipt.reservationId,
          eventRegistrationId: receipt.eventRegistrationId,
          reservationCustomer:
            receipt.reservation?.customer !== undefined
              ? receipt.reservation.customer
              : null,
          eventRegistrationCustomer:
            receipt.eventRegistration?.customer !== undefined
              ? receipt.eventRegistration.customer
              : null,
          reissuedTo: receipt.reissuedTo.map((child) => ({
            id: child.id,
            serialNo: child.serialNo,
            revision: child.revision,
            issuedAt: child.issuedAt.toISOString(),
          })),
        }}
        upChain={upChain.map((parent) => ({
          id: parent.id,
          serialNo: parent.serialNo,
          revision: parent.revision,
          issuedAt: parent.issuedAt.toISOString(),
        }))}
      />
    </AdminDetailLayout>
  );
}
