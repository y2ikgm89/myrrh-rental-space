"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/public/components/design-system/button";
import { Input } from "@/public/components/design-system/input";
import { Stack } from "@/public/components/design-system/stack";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { toAppRoute } from "@/shared/lib/typed-routes";

import { requestReceiptResendAction } from "../_actions/resend";

interface Props {
  readonly turnstileSiteKey: string | null;
  readonly initialSerialNo?: string;
}

/**
 * ゲスト向け領収書再送信リクエストフォーム。
 *
 * ## enumeration 対策
 * Server Action は match/mismatch に関わらず常に `MutationResult<null>` の success
 * を返す。client 側もそれを受けて同一の「完了画面」を表示することで、attacker が
 * serialNo / email の存在を推測できないようにする (Stripe recovery flow と同型)。
 *
 * ## Bot 対策
 *  - honeypot (`website` フィールド): 視覚的に隠した hidden input。bot はそこに入力しがち
 *  - formRenderedAt: マウント時刻を hidden field に埋め、submit までの時間で bot 判定
 *  - Turnstile: Cloudflare の bot 緩和
 */
export function ReceiptResendForm({
  turnstileSiteKey,
  initialSerialNo,
}: Props) {
  const [serialNo, setSerialNo] = useState(initialSerialNo ?? "");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRenderedAtRef = useRef<number | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  useEffect(() => {
    formRenderedAtRef.current = Date.now();
  }, []);

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border border-success/30 bg-success/5 p-6"
      >
        <p className="text-base font-medium text-foreground">
          再送信リクエストを受け付けました
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ご入力内容が正しい場合、ご登録メールアドレス宛に領収書ダウンロードリンクをお送りしました。
          数分以内に届かない場合は、迷惑メールフォルダをご確認いただくか、{" "}
          <Link
            href={toAppRoute("/contact")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            お問い合わせ
          </Link>{" "}
          よりご連絡ください。
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          再送信リンクの有効期限は発行から 24 時間、1
          回のみダウンロード可能です。
        </p>
      </div>
    );
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmedSerialNo = serialNo.trim();
    const trimmedEmail = email.trim();
    startTransition(async () => {
      const result = await requestReceiptResendAction({
        serialNo: trimmedSerialNo,
        email: trimmedEmail,
        honeypot,
        ...(formRenderedAtRef.current !== null
          ? { formRenderedAt: formRenderedAtRef.current }
          : {}),
        ...(turnstileToken.length > 0 ? { turnstileToken } : {}),
      });
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
        return;
      }
      setDone(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <Input
          type="text"
          label="領収書番号"
          value={serialNo}
          onChange={(e) => setSerialNo(e.target.value)}
          placeholder="例: 2026-000042"
          maxLength={20}
          autoComplete="off"
          required
          disabled={isPending}
        />
        <Input
          type="email"
          label="ご登録メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@example.com"
          maxLength={255}
          autoComplete="email"
          required
          disabled={isPending}
        />
        {/* Honeypot: 視覚的に隠した hidden input。bot はここに入力してしまう */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          style={{
            position: "absolute",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0,
          }}
        />
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.guest_receipt_resend_request}
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
        />
        {error !== null && (
          <div
            role="alert"
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "送信中..." : "再送信をリクエスト"}
        </Button>
      </Stack>
    </form>
  );
}
