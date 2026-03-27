"use client";

/**
 * Cloudflare Turnstile ウィジェット
 *
 * @marsidev/react-turnstile をラップした再利用可能コンポーネント。
 * siteKey が null の場合は何も描画しない（未設定時のグレースフルデグラデーション）。
 *
 * ## 使い方
 * Server Component で siteKey を取得し、props で渡す。
 * onVerify でトークンを受け取り、form.setValue("turnstileToken", token) でフォームに注入。
 * フォーム送信成功後は ref.current?.reset() でトークンをリセット（1回限り使用）。
 */

import { type ReactElement, type Ref } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

interface TurnstileWidgetProps {
  readonly siteKey: string | null;
  readonly onVerify: (token: string) => void;
  readonly onExpire?: () => void;
  readonly onError?: (errorCode: string) => void;
  readonly ref?: Ref<TurnstileInstance>;
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  ref,
}: TurnstileWidgetProps): ReactElement | null {
  if (!siteKey) return null;

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={onVerify}
      onExpire={onExpire}
      onError={onError}
      options={{
        theme: "auto",
        size: "flexible",
        language: "ja",
        refreshExpired: "auto",
        refreshTimeout: "auto",
      }}
    />
  );
}

export type { TurnstileInstance };
