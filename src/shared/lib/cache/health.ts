/**
 * Startup Cloudflare credentials + tag purge health probe.
 *
 * Run once at cold start from instrumentation.register() (production only).
 *
 * 1. Validates credentials via getCloudflareCredentialsValidated (same Zone ID
 *    regex check as runtime — malformed Zone ID fires HIGH-severity logError).
 * 2. Issues a canary purge_by_tags against a sentinel tag. Any failure is logged
 *    as an operational error; runtime tag purge calls still fail explicitly.
 */

import "server-only";
import {
  getCloudflareCredentialsValidated,
  callPurgeApiPublic,
} from "@/shared/lib/cloudflare";
import { serverEnv } from "@/shared/lib/env/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";

const CANARY_TAG = "cdn-tag-purge-canary-v1";

export async function assertCloudflareCredentials(): Promise<void> {
  if (process.env["NODE_ENV"] !== "production") return;
  // Production-mode E2E runs `next start` without real Cloudflare credentials.
  // Avoid external startup side effects while still exercising production env
  // validation and routing behavior.
  if (serverEnv.E2E_RUNTIME === "1") return;

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

    // Canary tag purge. Success proves credentials and API permission are usable.
    const result = await callPurgeApiPublic(creds.zoneId, creds.apiToken, {
      tags: [CANARY_TAG],
    });

    if (result.success) {
      logger.info("Cloudflare tag purge supported on this plan");
      return;
    }

    logError(
      new Error(
        `Cloudflare tag purge startup canary failed. Cloudflare error: ${result.error ?? "unknown"}`,
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
