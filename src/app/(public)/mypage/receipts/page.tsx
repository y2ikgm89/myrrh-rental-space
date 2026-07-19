/**
 * /mypage/receipts — 領収書一覧 (STATE-02)。
 *
 * Customer 単位で予約 / イベント経由の Receipt を横断表示する。
 * Reservation.deletedAt / Event.deletedAt な履歴も含む (適格請求書は append-only 契約、
 * 削除に追従しない — 消費税法 57条の4 の受領者側 7 年保管義務対応)。
 *
 * 削除元は UI に「削除済み」バッジを付けて注記する。DL 経路は
 * `/api/receipts/[serialNo]/pdf` (Better Auth session 経由の ownership 検証)。
 */

import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReceipts } from "@/shared/domain/receipts/queries";
import { mypageReceiptsSearchParams } from "@/public/lib/search-params";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Pagination } from "@/public/components/pagination";
import { ReceiptList } from "./_components/receipt-list";

interface MypageReceiptsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function MypageReceiptsPage({
  searchParams,
}: MypageReceiptsPageProps): Promise<ReactElement> {
  await connection();

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const { page } = await mypageReceiptsSearchParams.parse(searchParams);
  const { items, totalCount, totalPages, currentPage } =
    await getCustomerReceipts(customer.id, { page });

  // client 境界を跨がないため toPlainObject は不要 (ReceiptList は Server Component)。
  // Date のまま渡し、formatSerializedDate 側で string / Date 両対応する。
  return (
    <Stack gap="lg">
      <header className="space-y-1">
        <Heading level={1}>領収書</Heading>
        {totalCount > 0 && (
          <p className="text-sm text-muted-foreground">全 {totalCount} 件</p>
        )}
      </header>
      {totalCount === 0 ? (
        <div className="py-12 text-center md:py-16">
          <p className="text-muted-foreground">発行済みの領収書はありません</p>
        </div>
      ) : (
        <>
          <ReceiptList items={items} />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/mypage/receipts"
          />
        </>
      )}
    </Stack>
  );
}
