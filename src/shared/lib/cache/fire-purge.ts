/**
 * Body-success-aware purge wrapper.
 *
 * Returns the inner Promise<void> so tests can await it deterministically.
 * In production callers can ignore the return value (use as fire-and-forget).
 *
 * Cloudflare purge helpers return PurgeResult = { success: boolean; error?: string }.
 * A resolved { success: false } is logged as logError(MEDIUM) — without this wrapper
 * those soft failures would be invisible in Cloud Error Reporting.
 */

import "server-only";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export interface PurgeResult {
  success: boolean;
  error?: string | undefined;
  purgedFiles?: number;
}

export interface FirePurgeContext {
  operation: string;
  tags?: readonly string[];
  urls?: readonly string[];
}

export function firePurgeAsync(
  purge: () => Promise<PurgeResult>,
  ctx: FirePurgeContext,
): Promise<void> {
  const run = async (): Promise<void> => {
    const result = await purge();
    if (!result.success) {
      logError(
        new Error(
          `Cloudflare purge failed [${ctx.operation}]: ${result.error ?? "unknown"}`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: ctx.operation,
            tags: ctx.tags,
            urls: ctx.urls,
            purgedFiles: result.purgedFiles,
          },
        },
      );
    }
  };

  const promise = run();
  fireAndForget(promise, {
    operation: ctx.operation,
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
  return promise;
}
