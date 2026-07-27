/**
 * Turnstile Settings 解決 + 検証オーケストレーション。
 *
 * `shared/lib/turnstile` は secret/enabled を受け取って siteverify するだけ。
 * DB/env の解決と action 向け共通フローはこのモジュールが担う
 * （email render-context / GCal write-context と同型）。
 *
 * @module shared/domain/settings/turnstile
 */

import "server-only";

import {
  getDecryptedTurnstileSecretKey,
  getTurnstileConfig,
} from "@/shared/domain/settings/api-key-queries";
import { clientEnv } from "@/shared/lib/env/client";
import { serverEnv } from "@/shared/lib/env/server";
import { isE2ESecurityBypassAllowedFromHeaders } from "@/shared/lib/e2e-runtime";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import {
  isTurnstileEnabled as isTurnstileEnabledLib,
  verifyTurnstileToken as verifyTurnstileTokenLib,
  type TurnstileVerifyContext,
  type VerifyTurnstileParams,
  type VerifyTurnstileResult,
} from "@/shared/lib/turnstile";
import type { TurnstileAction } from "@/shared/lib/turnstile-actions";

export type {
  TurnstileVerifyContext,
  VerifyTurnstileParams,
  VerifyTurnstileResult,
};

export type TurnstileResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };

export type ValidateTurnstileParams = {
  readonly token: string | undefined;
  readonly expectedAction: TurnstileAction;
};

/**
 * Settings (DB 優先) + env fallback から検証 context を組み立てる。
 *
 * - Secret: DB 復号 → `TURNSTILE_SECRET_KEY`
 * - Enabled: site key と secret の両方が解決できること
 *   （masked DB secret または env secret × DB/env site key）
 */
export async function resolveTurnstileVerifyContext(): Promise<TurnstileVerifyContext> {
  const [secretFromDb, config] = await Promise.all([
    getDecryptedTurnstileSecretKey(),
    getTurnstileConfig(),
  ]);

  const secretKey = secretFromDb ?? serverEnv.TURNSTILE_SECRET_KEY ?? null;
  const enabled = Boolean(
    (config.siteKey || clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY) &&
    (config.secretKeyMasked || serverEnv.TURNSTILE_SECRET_KEY),
  );

  return { secretKey, enabled };
}

export async function isTurnstileEnabled(): Promise<boolean> {
  return isTurnstileEnabledLib(await resolveTurnstileVerifyContext());
}

export async function verifyTurnstileToken(
  params: VerifyTurnstileParams,
): Promise<VerifyTurnstileResult> {
  return verifyTurnstileTokenLib(await resolveTurnstileVerifyContext(), params);
}

/**
 * Turnstile 検証の共通フロー（公式推奨の action binding + remoteip + idempotency key）
 *
 * 呼び出し側は `expectedAction` を TURNSTILE_ACTIONS から指定するだけでよい。
 * `remoteip` は `getClientIpFromHeaders()` で自動取得。
 *
 * Settings/env に site/secret key が未設定の場合、dev/test は検証をスキップする。
 * 本番は bot 対策境界を fail-closed にするため、token 未検証を成功扱いにしない。
 */
export async function validateTurnstile(
  params: ValidateTurnstileParams,
): Promise<TurnstileResult> {
  // E2E bypass: localhost env URLs + E2E_RUNTIME=1 + production build +
  // リクエスト Host が loopback の AND のみ許可
  // (`isE2ESecurityBypassAllowed`、`security-auth.md` rule 準拠)。
  // E2E webServer は next start (production build) で起動し、Turnstile 秘密鍵は
  // env / DB 未設定のため、bypass しないと production の fail-closed 分岐に落ちて
  // 全 form action が「セキュリティ検証が必要」エラーで通らない。
  if (await isE2ESecurityBypassAllowedFromHeaders()) {
    return { success: true };
  }

  const context = await resolveTurnstileVerifyContext();

  if (!isTurnstileEnabledLib(context)) {
    if (serverEnv.NODE_ENV === "production") {
      return {
        success: false,
        error: "セキュリティ検証が必要です。ページを再読み込みしてください。",
      };
    }
    return { success: true };
  }

  if (!params.token) {
    return {
      success: false,
      error: "セキュリティ検証が必要です。ページを再読み込みしてください。",
    };
  }

  const result = await verifyTurnstileTokenLib(context, {
    token: params.token,
    expectedAction: params.expectedAction,
    remoteip: await getClientIpFromHeaders(),
  });

  if (!result.success) {
    return {
      success: false,
      error:
        "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
    };
  }

  return { success: true };
}
