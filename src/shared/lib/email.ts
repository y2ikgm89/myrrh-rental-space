/**
 * Email client re-export
 *
 * Resend クライアント設定の実体は email/client.ts に移動済み。
 * このファイルは後方互換のため re-export のみ行う。
 */
export {
  EMAIL_FROM,
  EMAIL_FROM_NAME,
  isEmailEnabled,
  getResendClient,
  getFromAddress,
} from "./email/client";
