"use client";

/**
 * Cloudflare Turnstile ウィジェット
 *
 * @marsidev/react-turnstile をラップした再利用可能コンポーネント。
 * siteKey が null の場合は何も描画しない（未設定時のグレースフルデグラデーション）。
 *
 * ## 使い方
 * Server Component で siteKey を取得し、props で渡す。
 * `action` は TURNSTILE_ACTIONS の値を必ず指定（server 側の expectedAction と一致）。
 * `appearance` は省略時 "always"（Cloudflare 公式デフォルト）、widget を隠したい場合は "interaction-only"。
 * onVerify でトークンを受け取り、form state に注入。
 * フォーム送信成功/失敗後は ref.current?.reset() でトークンをリセット（1 回限り使用）。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

import { type ReactElement, type Ref } from "react";
import { preconnect } from "react-dom";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  DEFAULT_TURNSTILE_APPEARANCE,
  type TurnstileAction,
  type TurnstileAppearance,
} from "@/shared/lib/turnstile-actions";

interface TurnstileWidgetProps {
  readonly siteKey: string | null;
  readonly action: TurnstileAction;
  readonly appearance?: TurnstileAppearance;
  readonly onVerify: (token: string) => void;
  readonly onExpire?: () => void;
  readonly onError?: (errorCode: string) => void;
  readonly ref?: Ref<TurnstileInstance>;
}

export function TurnstileWidget({
  siteKey,
  action,
  appearance = DEFAULT_TURNSTILE_APPEARANCE,
  onVerify,
  onExpire,
  onError,
  ref,
}: TurnstileWidgetProps): ReactElement | null {
  if (!siteKey) return null;

  // Cloudflare Turnstile スクリプト・iframe を読み込むオリジン。React 19 公式の
  // resource hint API（react-dom）でレンダー時に <link rel="preconnect"> を <head>
  // へ自動 hoist。Turnstile は no-cors fetch のため crossOrigin は付けない（付けると
  // CORS-anonymous ソケットになり実 fetch と socket pool が分離して無効化）。
  preconnect("https://challenges.cloudflare.com");

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={onVerify}
      onExpire={onExpire}
      onError={onError}
      options={{
        action,
        appearance,
        theme: "auto",
        size: "flexible",
        language: "ja",
        retry: "auto",
        refreshExpired: "auto",
        refreshTimeout: "auto",
      }}
    />
  );
}

export type { TurnstileInstance };
