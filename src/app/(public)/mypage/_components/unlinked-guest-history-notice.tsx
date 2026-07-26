import "server-only";

import type { ReactElement } from "react";
import Link from "next/link";

type UnlinkedGuestHistoryNoticeProps = {
  readonly hasUnlinkedGuestHistory: boolean;
  readonly showContactLink: boolean;
};

/**
 * 同一 emailCanonical の未リンク guest Customer が別に存在するときの警告。
 *
 * email だけでは本人性を証明できないため自動マージは行わない（IDOR 防止）。
 * 履歴統合は管理者マージまたは署名付き claim トークン経路に委ね、会員には
 * お問い合わせ導線だけを示す（clean break・silent auto-link なし）。
 */
export function UnlinkedGuestHistoryNotice({
  hasUnlinkedGuestHistory,
  showContactLink,
}: UnlinkedGuestHistoryNoticeProps): ReactElement | null {
  if (!hasUnlinkedGuestHistory) return null;

  return (
    <div
      role="status"
      className="mb-6 border border-border bg-muted/40 p-4 text-sm text-foreground"
    >
      同じメールアドレスで、ログイン前に作成された予約・お問い合わせ等の履歴が
      別レコードとして残っている可能性があります。マイページへの統合が必要な場合は
      {showContactLink ? (
        <>
          <Link
            href="/contact"
            className="mx-1 text-accent underline underline-offset-4"
          >
            お問い合わせ
          </Link>
          ください。
        </>
      ) : (
        <>運営へご連絡ください。</>
      )}
    </div>
  );
}
