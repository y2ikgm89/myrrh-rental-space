"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { Textarea } from "@/public/components/design-system/textarea";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { replyToInquiryAction } from "../../../_shared/actions/inquiry";

interface InquiryReplyFormProps {
  readonly inquiryId: string;
  readonly status: string;
  readonly turnstileSiteKey: string | null;
}

export function InquiryReplyForm({
  inquiryId,
  status,
  turnstileSiteKey,
}: InquiryReplyFormProps): ReactElement | null {
  if (status === "CLOSED") {
    return (
      <section className="mt-10 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          このお問い合わせは終了しているため、返信できません。
        </p>
      </section>
    );
  }

  if (status === "SPAM") {
    return (
      <section className="mt-10 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          このお問い合わせには返信できません。
        </p>
      </section>
    );
  }

  return (
    <InquiryReplyFormInner
      inquiryId={inquiryId}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}

function InquiryReplyFormInner({
  inquiryId,
  turnstileSiteKey,
}: Omit<InquiryReplyFormProps, "status">): ReactElement {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await replyToInquiryAction(
        inquiryId,
        body,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        setTurnstileToken("");
        return;
      }
      setBody("");
      setTurnstileToken("");
      turnstileRef.current?.reset();
      router.refresh();
    });
  };

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-base font-medium text-foreground">返信を送る</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          label="返信内容"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="追加のご質問やご連絡内容を入力してください"
          maxLength={5000}
          disabled={isPending}
          required
        />

        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.mypage_inquiry_reply}
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
        />

        {error != null && (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <Button type="submit" disabled={isPending || body.trim().length === 0}>
          {isPending ? "送信中..." : "返信を送信する"}
        </Button>
      </form>
    </section>
  );
}
