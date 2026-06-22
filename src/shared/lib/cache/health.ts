/**
 * Startup Cloudflare credentials + plan-tier health probe.
 *
 * Run once at cold start from instrumentation.register() (production only).
 *
 * 1. Validates credentials via getCloudflareCredentialsValidated (same Zone ID
 *    regex check as runtime — malformed Zone ID fires HIGH-severity logError).
 * 2. Issues a canary purge_by_tags against a sentinel tag. If Cloudflare returns
 *    a plan-tier feature-not-available error (typical code 1015/1016 family or
 *    a specific 'feature is not available on your plan' message), flips the
 *    process-global cloudflareTagPurgeEnabled flag to false. purgeCloudflareCache-
 *    ByTags consults this flag at runtime and falls back to purgeAllCloudflareCache.
 */

import "server-only";
import {
  getCloudflareCredentialsValidated,
  setCloudflareTagPurgeEnabled,
  callPurgeApiPublic,
} from "@/shared/lib/cloudflare";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/logger";

const CANARY_TAG = "cdn-tag-purge-canary-v1";

export async function assertCloudflareCredentials(): Promise<void> {
  if (process.env["NODE_ENV"] !== "production") return;

  try {
    const creds = getCloudflareCredentialsValidated();
    if (!creds) {
      logError(
        new Error(
          "Cloudflare credentials missing or malformed at startup — cache purges will silently no-op",
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            component: "cloudflare",
            phase: "instrumentation.register",
          },
        },
      );
      return;
    }

    // Plan-tier probe: canary tag purge. Success = plan supports tag purge.
    // Failure with plan-tier signal = degrade to URL-purge fallback.
    const result = await callPurgeApiPublic(creds.zoneId, creds.apiToken, {
      tags: [CANARY_TAG],
    });

    if (result.success) {
      logger.info("Cloudflare tag purge supported on this plan");
      return;
    }

    // Cloudflare plan-tier signal: error message commonly contains 'plan'.
    // Defensive heuristic: if error mentions 'plan' or 'enterprise' or '"code":1015',
    // assume tag purge is unavailable and degrade.
    const errLower = (result.error ?? "").toLowerCase();
    const planTierSignal =
      errLower.includes("plan") ||
      errLower.includes("enterprise") ||
      errLower.includes("not available") ||
      errLower.includes("1015") ||
      errLower.includes("1016");

    if (planTierSignal) {
      setCloudflareTagPurgeEnabled(false);
      logError(
        new Error(
          `Cloudflare tag purge unavailable on this plan — falling back to URL purge. Cloudflare error: ${result.error}`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            component: "cloudflare",
            phase: "instrumentation.register",
            cloudflareError: result.error,
          },
        },
      );
    } else {
      logger.warn("Cloudflare canary tag purge failed (non-plan-tier)", {
        error: result.error,
      });
    }
  } catch (error) {
    logError(
      error instanceof Error
        ? error
        : new Error("Cloudflare credential probe failed"),
      {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          component: "cloudflare",
          phase: "instrumentation.register",
        },
      },
    );
  }
}
