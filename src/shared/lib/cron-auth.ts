import { logError } from "@/shared/lib/errors/logger-core";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/types";
import { jsonError } from "@/shared/lib/route-responses";

type AuthorizeCronRequestOptions = {
  authorizationHeader: string | null;
  secret: string | undefined;
  nodeEnv: string;
  operation: string;
};

export function authorizeCronRequest({
  authorizationHeader,
  secret,
  nodeEnv,
  operation,
}: AuthorizeCronRequestOptions) {
  if (!secret && nodeEnv === "production") {
    logError(new Error("CRON_SECRET is not set in production environment"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.CRITICAL,
      context: { operation },
    });
    return jsonError("Server configuration error", 500);
  }

  if (!secret && nodeEnv !== "production") {
    logError(
      new Error(
        "CRON_SECRET is not set - authentication skipped in development",
      ),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: { operation, environment: nodeEnv },
      },
    );
    return null;
  }

  if (secret && authorizationHeader !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
