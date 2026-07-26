import "server-only";

import { cookies } from "next/headers";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { getPublicMaintenanceBlockMutation } from "@/shared/lib/maintenance-guard";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
  type RateLimitResult,
} from "@/shared/lib/rate-limit";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { tokenFingerprint } from "@/shared/lib/tokens/fingerprint";
import type { TurnstileAction } from "@/shared/lib/turnstile-actions";

const INVALID_LINK_ERROR = "キャンセルリンクが無効または期限切れです";
const STALE_TAB_ERROR =
  "表示中のページが最新ではありません。ページを再読み込みしてから再度お試しください";

export type VerifyGuestTokenResult =
  | { valid: true; entityId: string }
  | { valid: false; reason: "invalid" | "expired" };

export type GuestTokenMemberGuardResult<TMemberContext = void> =
  { ok: true; memberContext: TMemberContext } | { ok: false; error: string };

export interface GuestTokenMutationConfig<TMemberContext = void> {
  /** logError context.operation */
  operation: string;
  cookieName: string;
  turnstileAction: TurnstileAction;
  turnstileToken?: string | undefined;
  expectedEntityId: string;
  verifyToken: (token: string, now: Date) => VerifyGuestTokenResult;
  verifyNow: () => Date;
  parseEntityId: (
    entityId: string,
  ) => { success: true; data: string } | { success: false; message: string };
  perEntityRateLimiter: {
    check: (entityId: string) => Promise<RateLimitResult>;
  };
  /** logError context.limiter for per-entity hits */
  perEntityRateLimitLogLimiter: string;
  perEntityRateLimitError: string;
  /** entity id 突合後の追加検証（例: キャンセル理由）。エラー時は MutationResult を返す。 */
  afterEntityIdMatch?: (
    entityId: string,
  ) => Promise<MutationResult<null> | undefined>;
  guardMemberOwnership?: (
    entityId: string,
    sessionUserId: string,
  ) => Promise<GuestTokenMemberGuardResult<TMemberContext>>;
  execute: (input: {
    entityId: string;
    token: string;
    sessionUserId: string | null;
    memberContext: TMemberContext;
  }) => Promise<MutationResult<null>>;
}

/**
 * ゲスト向け HttpOnly cookie トークン Server Action の共通パイプライン。
 *
 * セキュリティ階層（entity 固有の順序差は config で保持）:
 *  1. maintenance block
 *  2. IP rate-limit（formSubmitRateLimiter）
 *  3. Turnstile
 *  4. cookie → 暗号検証
 *  5. entity id 形式検証 + 表示中 entity との突合（stale-tab 対策）
 *  6. optional afterEntityIdMatch（理由など）
 *  7. optional member-ownership（inject）
 *  8. per-entity rate-limit
 *  9. execute() — domain mutation + side effects
 */
export async function runGuestTokenMutation<TMemberContext = void>(
  config: GuestTokenMutationConfig<TMemberContext>,
): Promise<MutationResult<null>> {
  const maintenanceBlock = await getPublicMaintenanceBlockMutation();
  if (maintenanceBlock) return maintenanceBlock;

  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) {
    logError(new Error("Guest token mutation rate-limit hit (form/IP)"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: config.operation,
        limiter: "formSubmit",
      },
    });
    return createMutationError("リクエストが多すぎます");
  }

  const turnstile = await validateTurnstile({
    token: config.turnstileToken,
    expectedAction: config.turnstileAction,
  });
  if (!turnstile.success) {
    logError(new Error("Guest token mutation Turnstile failed"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: config.operation,
        ip: await getClientIpFromHeaders(),
      },
    });
    return createMutationError(turnstile.error);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(config.cookieName)?.value ?? null;
  if (!token) {
    return createMutationError(INVALID_LINK_ERROR);
  }

  const verified = config.verifyToken(token, config.verifyNow());
  if (!verified.valid) {
    logError(
      new Error(`Guest token mutation verify failed: ${verified.reason}`),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: config.operation,
          reason: verified.reason,
          ip: await getClientIpFromHeaders(),
          tokenFingerprint: tokenFingerprint(token),
        },
      },
    );
    return createMutationError(INVALID_LINK_ERROR);
  }

  const parsedId = config.parseEntityId(verified.entityId);
  if (!parsedId.success) {
    return createMutationError(parsedId.message);
  }

  if (parsedId.data !== config.expectedEntityId) {
    logError(new Error("Guest token mutation entity id mismatch (stale tab)"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: config.operation,
        ip: await getClientIpFromHeaders(),
      },
    });
    return createMutationError(STALE_TAB_ERROR);
  }

  if (config.afterEntityIdMatch) {
    const afterMatch = await config.afterEntityIdMatch(parsedId.data);
    if (afterMatch) return afterMatch;
  }

  const session = await getCustomerSession();
  const sessionUserId = session?.user.id ?? null;
  let memberContext = undefined as TMemberContext;

  const runMemberGuard = async (): Promise<MutationResult<null> | null> => {
    if (!sessionUserId || !config.guardMemberOwnership) return null;
    const guard = await config.guardMemberOwnership(
      parsedId.data,
      sessionUserId,
    );
    if (!guard.ok) return createMutationError(guard.error);
    memberContext = guard.memberContext;
    return null;
  };

  const runPerEntityRateLimit =
    async (): Promise<MutationResult<null> | null> => {
      const perEntity = await config.perEntityRateLimiter.check(parsedId.data);
      if (!perEntity.success) {
        logError(
          new Error("Guest token mutation rate-limit hit (per-entity)"),
          {
            category: ErrorCategory.AUTHORIZATION,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: config.operation,
              limiter: config.perEntityRateLimitLogLimiter,
              entityId: parsedId.data,
              ip: await getClientIpFromHeaders(),
            },
          },
        );
        return createMutationError(config.perEntityRateLimitError);
      }
      return null;
    };

  const perEntityError = await runPerEntityRateLimit();
  if (perEntityError) return perEntityError;

  const memberError = await runMemberGuard();
  if (memberError) return memberError;

  return config.execute({
    entityId: parsedId.data,
    token,
    sessionUserId,
    memberContext,
  });
}
