import "server-only";
import type { ReactElement } from "react";
import Link from "next/link";
import { isCustomerProfileComplete } from "@/shared/domain/customers/profile-check";

interface IncompleteProfileNoticeProps {
  readonly customer: {
    readonly lastName: string;
    readonly firstName: string;
    readonly email: string;
  };
}

/**
 * マイページ全体の「お名前未登録」警告。
 * customer プロフィールが未完成の場合のみ render する Server Component。
 * mypage layout で MypageNav の直後に配置し、各 page での重複を解消（SSoT 化）。
 */
export function IncompleteProfileNotice({
  customer,
}: IncompleteProfileNoticeProps): ReactElement | null {
  if (isCustomerProfileComplete(customer)) return null;

  return (
    <div className="mb-6 border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
      お名前が未登録です。
      <Link
        href="/mypage/settings"
        className="ml-1 text-accent underline underline-offset-4 hover:text-foreground"
      >
        アカウント設定
      </Link>
      から姓名を入力してください。
    </div>
  );
}
