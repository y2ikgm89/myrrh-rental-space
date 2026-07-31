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
 * フォーム送信成功/失敗後は ref.current?.reset() でトークンをリセット（1 回限り使用）。
 *
 * ## トークンの受け取り方は 2 通り。所有者は常にどちらか一方だけ
 *
 * 1. **widget が所有（`onVerify` を渡さない）** — widget が
 *    `TURNSTILE_TOKEN_FIELD_NAME` の hidden input を自前で描画・更新する
 *    （Cloudflare 公式の `response-field-name`）。利用側は何も配線しない。
 *    conform 併用フォームは必ずこちら。
 * 2. **呼び出し側が所有（`onVerify` を渡す）** — 受け取ったトークンを state に持ち、
 *    引数で Server Action に渡す / 自前の hidden input に描画する。この場合
 *    widget は response field を出さない（同名フィールドの二重描画を防ぐ）。
 *
 * ## conform 管理下のフィールドに値を流し込んではいけない
 *
 * 以前は 1 の用途でも `useInputControl(fields.turnstileToken)` + `onVerify` で
 * conform のフィールドへ書き込んでいた。これには 2 つの実害があった:
 *
 * - reject 応答を受けて `control.change("")` すると conform が
 *   `shouldRevalidate: "onInput"` で再バリデーションし、**サーバーが返した
 *   form-level エラーを client 検証結果で上書きして消す**。実測では
 *   「このタイムスロットは満員です」がユーザーに一度も表示されず、代わりに
 *   Zod 既定の `Invalid input: expected string, received undefined` が出ていた。
 * - `useInputControl` の戻り値は毎レンダー新しいオブジェクトなので、これを
 *   effect の依存に入れると reset → 再チャレンジ → change → 再レンダー … の
 *   無限ループになった（PR #1758）。
 *
 * widget が hidden input の `.value` を直接書く経路は input イベントを発火しない
 * ため、conform の再バリデーションを誘発しない。
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

/**
 * widget が描画する hidden input の name。フォーム側の Zod スキーマと
 * server 側の `validateTurnstile` が読むフィールド名の SSoT。
 */
export const TURNSTILE_TOKEN_FIELD_NAME = "turnstileToken";

interface TurnstileWidgetProps {
  readonly siteKey: string | null;
  readonly action: TurnstileAction;
  readonly appearance?: TurnstileAppearance;
  /**
   * `<form>` 送信ではなく引数でトークンを渡す画面用。フォーム送信の場合は
   * 指定不要（widget が hidden input を持つ）。
   */
  readonly onVerify?: (token: string) => void;
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
        // **トークンの所有者は常に 1 つ**。`onVerify` を渡す利用者は自分で
        // state に持って hidden input を描画する / 引数で Server Action に渡すため、
        // widget は response field を出さない。出すと `<form>` 内で同名フィールドが
        // 二重になり、FormData が配列化して `z.string()` のスキーマが弾く
        // （実例: reservation-form は state 由来の turnstileToken を自前で描画する）。
        // `onVerify` を渡さない = widget が所有する、が唯一の分岐条件。
        responseField: onVerify === undefined,
        responseFieldName: TURNSTILE_TOKEN_FIELD_NAME,
      }}
    />
  );
}

export type { TurnstileInstance };
