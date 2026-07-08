"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { isMutationError } from "@/shared/lib/mutation-result";
import { claimReservationAction } from "../_actions/claim";

/**
 * ログイン済みユーザー向けの claim 確認ボタン。
 *
 * ページ描画時ではなく、このボタンのクリック（`useTransition` 内の Server Action
 * 呼び出し）でのみ claim を実行する（`<Link>` prefetch / 再訪問による意図しない
 * claim を防ぐため）。
 */
export function ClaimConfirmForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimReservationAction();
      if (isMutationError(result)) {
        setError(result.error);
        return;
      }
      router.push(`/mypage/reservations/${result.reservationId}`);
    });
  };

  return (
    <div className="space-y-4">
      {error != null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      <Button onClick={handleConfirm} disabled={isPending}>
        {isPending ? "反映中..." : "この予約をマイページに追加する"}
      </Button>
    </div>
  );
}
