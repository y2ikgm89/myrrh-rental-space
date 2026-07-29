"use client";

import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { confirmCustomerMergeAction } from "../../../_shared/actions/customer-merge";
import type { CustomerMergePreview } from "@/shared/domain/customers/customer-merge-commands";

type ConfirmMergeFormProps = {
  readonly token: string;
  readonly preview: CustomerMergePreview;
};

function formatCount(label: string, count: number): string {
  return `${label}: ${count.toString()} 件`;
}

export function ConfirmMergeForm({
  token,
  preview,
}: ConfirmMergeFormProps): ReactElement {
  return (
    <form action={confirmCustomerMergeAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      <div className="border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium text-foreground">統合対象の履歴</p>
        <ul className="mt-3 space-y-1 text-muted-foreground">
          <li>{formatCount("予約", preview.reservationCount)}</li>
          <li>{formatCount("お問い合わせ", preview.inquiryCount)}</li>
          <li>{formatCount("レビュー", preview.reviewCount)}</li>
          <li>{formatCount("イベント参加", preview.registrationCount)}</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          対象メールアドレス: {preview.guestEmail}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        「統合する」を押すと、上記の履歴が現在のマイページアカウントへ移管され、
        ゲスト側の顧客レコードは削除されます。この操作は取り消せません。
      </p>

      <Button variant="primary" size="md" type="submit" className="self-start">
        統合する
      </Button>
    </form>
  );
}
