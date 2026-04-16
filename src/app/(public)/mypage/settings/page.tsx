/**
 * /mypage/settings — アカウント設定ページ
 *
 * プロフィール編集、アカウント連携管理、アカウント削除。
 * searchParams.require_email=true 時はメール登録バナーを表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getAccountLinksAction } from "../_shared/actions/account";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { isMutationError } from "@/shared/lib/mutation-result";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Divider } from "@/public/components/design-system/divider";
import { ProfileForm } from "./_components/profile-form";
import { AccountLinking } from "./_components/account-linking";

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const requireEmail = params["require_email"] === "true";

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

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

      {requireEmail && (
        <div
          className="border border-accent/30 bg-accent/5 p-4 text-sm text-foreground"
          role="alert"
        >
          サービスをご利用いただくには、メールアドレスの登録が必要です。
        </div>
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
