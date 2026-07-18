/**
 * /mypage/settings/email-verified — メールアドレスの本人確認 URL 成功着地ページ。
 *
 * `/api/customer/verify-email` の GET が `consumeCustomerEmailChangeCommand` を
 * 通したあとに 302 で遷移する。ここではもう副作用は起こさず結果表示のみ。
 */

import type { ReactElement } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default async function EmailVerifiedPage(): Promise<ReactElement> {
  await connection();

  return (
    <main id="main-content">
      <Stack gap="lg">
        <Heading level={1}>メールアドレスの登録が完了しました</Heading>
        <p>
          今後の予約通知・お問い合わせ返信・領収書発行などはこのメールアドレス
          宛にお送りします。
        </p>
        <p>
          <Link href="/mypage/settings">アカウント設定に戻る</Link>
        </p>
      </Stack>
    </main>
  );
}
