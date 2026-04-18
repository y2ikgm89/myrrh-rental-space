/**
 * Cloudflare Turnstile サーバーサイド検証
 *
 * 公式ベストプラクティスに準拠した siteverify 呼び出し:
 * - `remoteip` を送信（ボットスコア精度向上）
 * - `idempotency_key` を必ず生成（ネットワーク失敗時の安全な再検証）
 * - `expectedAction` を応答の `action` と突き合わせ（token 盗用時の被害範囲限定）
 * - timeout 10 秒（公式推奨値）
 *
 * ## キー取得元
 * - Site Key: DB の `Settings` から取得（管理画面で設定）
 * - Secret Key: DB の `Settings` から暗号化保存
 *
 * ## 開発環境
 * シークレットキーが本番で未設定の場合は拒否、開発では検証をスキップする。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * @see https://developers.cloudflare.com/turnstile/reference/testing/
 * @module shared/lib/turnstile
 */

import "server-only";
import {
  getDecryptedTurnstileSecretKey,
  getTurnstileConfig,
} from "@/shared/domain/settings/api-key-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "./errors/server";
import type { TurnstileAction } from "./turnstile-actions";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** 公式推奨値 */
const SITEVERIFY_TIMEOUT_MS = 10_000;

export type VerifyTurnstileParams = {
  readonly token: string;
  readonly expectedAction: TurnstileAction;
  readonly remoteip?: string;
  /** 省略時は `crypto.randomUUID()` で自動生成（公式推奨） */
  readonly idempotencyKey?: string;
};

export type VerifyTurnstileResult =
  | {
      readonly success: true;
      readonly hostname?: string;
      readonly action?: string;
    }
  | {
      readonly success: false;
      readonly errorCodes: readonly string[];
    };

type TurnstileSiteverifyResponse = {
  readonly success: boolean;
  readonly "error-codes"?: readonly string[];
  readonly challenge_ts?: string;
  readonly hostname?: string;
  readonly action?: string;
  readonly cdata?: string;
};

async function getTurnstileSecretKey(): Promise<string | null> {
  return getDecryptedTurnstileSecretKey();
}

/**
 * Turnstile トークンを検証
 *
 * Secret Key が未設定の場合:
 * - 本番: HIGH severity でログ、拒否
 * - 開発: 検証スキップ（test secret key を使えばスキップ不要）
 */
export async function verifyTurnstileToken(
  params: VerifyTurnstileParams,
): Promise<VerifyTurnstileResult> {
  const secretKey = await getTurnstileSecretKey();

  if (!secretKey) {
    if (process.env["NODE_ENV"] === "production") {
      logError(new Error("Turnstile secret key not configured in production"), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        context: { operation: "verifyTurnstileToken" },
      });
      return { success: false, errorCodes: ["missing-secret-key"] };
    }
    return { success: true };
  }

  if (!params.token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();

  const body: Record<string, string> = {
    secret: secretKey,
    response: params.token,
    idempotency_key: idempotencyKey,
  };
  if (params.remoteip) {
    body["remoteip"] = params.remoteip;
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      logError(
        new Error(`Turnstile API returned non-OK status: ${response.status}`),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "verifyTurnstileToken",
            status: response.status,
          },
        },
      );
      return { success: false, errorCodes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as TurnstileSiteverifyResponse;

    if (!data.success) {
      const errorCodes = data["error-codes"] ?? ["unknown-error"];
      logError(new Error("Turnstile verification failed"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "verifyTurnstileToken",
          errorCodes,
          expectedAction: params.expectedAction,
        },
      });
      return { success: false, errorCodes };
    }

    // action binding 検証
    if (data.action !== params.expectedAction) {
      logError(new Error("Turnstile action mismatch"), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "verifyTurnstileToken",
          expectedAction: params.expectedAction,
          receivedAction: data.action,
        },
      });
      return { success: false, errorCodes: ["action-mismatch"] };
    }

    return {
      success: true,
      ...(data.hostname && { hostname: data.hostname }),
      ...(data.action && { action: data.action }),
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "verifyTurnstileToken" },
    });
    return { success: false, errorCodes: ["network-error"] };
  }
}

/**
 * Turnstile が有効かどうか（DB ベース、site key + secret key の両方が必要）
 */
export async function isTurnstileEnabled(): Promise<boolean> {
  const config = await getTurnstileConfig();
  return Boolean(config.siteKey && config.secretKeyMasked);
}
