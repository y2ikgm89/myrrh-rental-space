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

  // 旧版は <div> + 内部 inline <Link> でアクセシブルなタップ標的が
  // 「アカウント設定」テキストのみ (14px line-height) と狭く、WCAG 2.5.5 未達。
  // notice 全体を Link 化することで notice カード全面を 44px+ tap target にする。
  return (
    <Link
      href="/mypage/settings"
      className="mb-6 block min-h-[var(--touch-target-min)] border border-accent/30 bg-accent/5 p-4 text-sm text-foreground transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      お名前が未登録です。
      <span className="ml-1 text-accent underline underline-offset-4">
        アカウント設定
      </span>
      から姓名を入力してください。
    </Link>
  );
}
