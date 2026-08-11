/**
 * /mypage/terms/reagree — LOGIN_SIGNUP scope の必須規約が更新された・未同意の場合の再同意ページ
 *
 * MypageAuthGate は「pending が存在する」ことを検出して本ページに redirect する。
 * ここでは requireMypageSession → ensureCustomerLinked → pending 再導出を行い、
 * 0 件なら returnTo (allowlist 経由でサニタイズ) にリダイレクト、それ以外は
 * ReagreeForm を出す。
 *
 * PPR (`await connection()`) と Multiple Root Layouts の慣例に従い、動的化は
 * `await connection()` で行う (`export const dynamic` 等の route segment config は禁止)。
 */

import type { ReactElement } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { getReagreeRequiredTermsForCustomer } from "@/shared/domain/terms/queries";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { sanitizeRenderedContentHtml } from "@/shared/lib/html/sanitize";
import { ReagreeForm } from "./_components/reagree-form";
import { sanitizeReturnTo } from "./_lib/sanitize-return-to";

export const metadata: Metadata = {
  title: "利用規約の再同意",
  robots: { index: false, follow: false },
};

export default async function TermsReagreePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  await connection();

  const { user } = await requireMypageSession();
  const { customer } = await ensureCustomerLinked(user);

  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params["returnTo"]);

  const rawPending = await getReagreeRequiredTermsForCustomer(customer.id);
  // client component へ渡す前にサーバーで sanitize する（jsdom をリクエスト経路へ
  // 引き込まないため、sanitize は必ずサーバー側で済ませる）
  const pending = rawPending.map((term) => ({
    ...term,
    contentHtml: sanitizeRenderedContentHtml(term.contentHtml),
    // previousSnapshot は optional property。undefined を明示代入すると
    // exactOptionalPropertyTypes に弾かれるので、値があるときだけ差し替える。
    ...(typeof term.previousSnapshot === "string"
      ? { previousSnapshot: sanitizeRenderedContentHtml(term.previousSnapshot) }
      : {}),
  }));
  if (pending.length === 0) {
    redirect(toAppRoute(returnTo));
  }

  return (
    <Stack gap="xl">
      <Heading level={1}>利用規約の再同意</Heading>
      <ReagreeForm pending={pending} returnTo={returnTo} />
    </Stack>
  );
}
