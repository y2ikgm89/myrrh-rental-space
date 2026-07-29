"use client";

import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { requestCustomerMergeAction } from "../../../_shared/actions/customer-merge";
import { isMutationError } from "@/shared/lib/mutation-result";

type RequestMergeFormProps = {
  readonly maskedGuestEmail: string;
};

export function RequestMergeForm({
  maskedGuestEmail,
}: RequestMergeFormProps): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await requestCustomerMergeAction();
      if (isMutationError(result)) {
        setError(result.error);
        return;
      }
      setMessage(result.successMessage);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        統合対象のメールアドレス:{" "}
        <span className="font-medium text-foreground">{maskedGuestEmail}</span>
      </p>

      {error !== null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {message !== null && (
        <div
          className="border border-border bg-muted/40 p-4 text-sm text-foreground"
          role="status"
        >
          {message}
        </div>
      )}

      <Button
        type="button"
        variant="primary"
        size="md"
        disabled={isPending}
        onClick={handleSubmit}
      >
        {isPending ? "送信中..." : "確認メールを送信"}
      </Button>
    </div>
  );
}
