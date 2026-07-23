/**
 * /mypage/settings/email-verified/error — メールアドレス本人確認 URL のエラー着地。
 *
 * `/api/customer/verify-email` の POST が DomainError で失敗したとき (期限切れ / 使用済み /
 * 別顧客と競合) に 302 で遷移する。理由を searchParams で受け取り、UI で分岐する。
 */

import type { ReactElement } from "react";
import { connection } from "next/server";
import Link from "next/link";
import type { SearchParams } from "nuqs/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

function messageFor(reason: string | undefined): string {
  if (reason === "conflict") {
    return "このメールアドレスは他の顧客が使用中のため登録できません。別のメールアドレスをお試しください。";
  }
  return "確認 URL が無効か、有効期限が切れています。マイページから再度メールアドレスを入力してください。";
}

export default async function EmailVerifiedErrorPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  await connection();
  const params = await searchParams;
  const reasonRaw = params["reason"];
  const reason = typeof reasonRaw === "string" ? reasonRaw : undefined;

  return (
    <main id="main-content">
      <Stack gap="lg">
        <Heading level={1}>メールアドレスの確認に失敗しました</Heading>
        <p>{messageFor(reason)}</p>
        <p>
          <Link href="/mypage/settings">アカウント設定に戻る</Link>
        </p>
      </Stack>
    </main>
  );
}
