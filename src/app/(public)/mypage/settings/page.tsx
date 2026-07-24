/**
 * /mypage/settings — アカウント設定ページ
 *
 * プロフィール編集、アカウント連携管理、アカウント削除。
 * searchParams.require_email=true 時はメール登録バナーを表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getAccountLinksAction } from "../_shared/actions/account";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { isMutationError } from "@/shared/lib/mutation-result";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Divider } from "@/public/components/design-system/divider";
import { ProfileForm } from "./_components/profile-form";
import { AccountLinking } from "./_components/account-linking";
import { FlashMessage } from "../_components/flash-message";

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  await connection();

  const params = await searchParams;
  const requireEmailParam = params["require_email"] === "true";

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  // email 未登録の場合のみ banner を出す (既に登録済 = 保存後 reload の永続表示を防ぐ).
  // Customer.email は schema 上 non-null だが LINE 経由の legacy row は空文字あり
  // (layout.tsx の `if (!customer.email)` と同じ判定).
  const showRequireEmail = requireEmailParam && !customer.email;

  const [accountResult, turnstileSiteKey] = await Promise.all([
    getAccountLinksAction(),
    getTurnstileSiteKey(),
  ]);
  const providers = isMutationError(accountResult)
    ? []
    : accountResult.accounts;

  return (
    <Stack gap="xl">
      <Heading level={1}>アカウント設定</Heading>

      {showRequireEmail && (
        <FlashMessage queryKey="require_email" variant="notice">
          サービスをご利用いただくには、メールアドレスの登録が必要です。
        </FlashMessage>
      )}

      <section className="space-y-6">
        <Heading level={2}>プロフィール</Heading>
        <ProfileForm
          defaultValues={{
            customerType: customer.customerType,
            lastName: customer.lastName,
            firstName: customer.firstName,
            companyName: customer.companyName ?? "",
            email: customer.email,
            phoneNumber: customer.phoneNumber ?? "",
            marketingOptIn: customer.marketingOptIn,
          }}
          turnstileSiteKey={turnstileSiteKey}
        />
      </section>

      <Divider variant="subtle" />

      <section className="space-y-6">
        <Heading level={2}>アカウント連携</Heading>
        <AccountLinking
          providers={providers}
          turnstileSiteKey={turnstileSiteKey}
        />
      </section>
    </Stack>
  );
}
