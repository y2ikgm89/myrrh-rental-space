import "server-only";

import { OAuth2Client } from "google-auth-library";
import { serverEnv } from "@/shared/lib/env/server";
import { logError } from "@/shared/lib/errors/logger-core";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/types";
import { jsonError } from "@/shared/lib/route-responses";

export type VerifiedCronOidcToken = {
  email: string;
  subject: string;
};

type VerifyCronOidcToken = (
  idToken: string,
  audience: string,
) => Promise<VerifiedCronOidcToken>;

type AuthorizeCronRequestOptions = {
  request: Request;
  operation: string;
  verifyToken?: VerifyCronOidcToken;
  audience?: string;
  serviceAccountEmail?: string;
};

let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  oauthClient ??= new OAuth2Client();
  return oauthClient;
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) return null;
  const token = authorizationHeader.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

async function verifyGoogleOidcToken(
  idToken: string,
  audience: string,
): Promise<VerifiedCronOidcToken> {
  const ticket = await getOAuthClient().verifyIdToken({
    idToken,
    audience,
  });
  const payload = ticket.getPayload();
  const email = payload?.email;
  const subject = payload?.sub;

  if (!email) {
    throw new Error("Cloud Scheduler OIDC token email claim is missing");
  }
  if (!subject) {
    throw new Error("Cloud Scheduler OIDC token subject claim is missing");
  }

  return { email, subject };
}

export async function authorizeCronRequest({
  request,
  operation,
  verifyToken = verifyGoogleOidcToken,
  audience = serverEnv.CRON_OIDC_AUDIENCE,
  serviceAccountEmail = serverEnv.CRON_SERVICE_ACCOUNT_EMAIL,
}: AuthorizeCronRequestOptions): Promise<Response | null> {
  if (!audience || !serviceAccountEmail) {
    logError(
      new Error(
        "Cloud Scheduler OIDC configuration is missing in production environment",
      ),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.CRITICAL,
        context: { operation },
      },
    );
    return jsonError("Server configuration error", 500);
  }

  const idToken = extractBearerToken(request.headers.get("authorization"));
  if (!idToken) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const verified = await verifyToken(idToken, audience);
    if (verified.email !== serviceAccountEmail) {
      logError(new Error("Unexpected Cloud Scheduler OIDC service account"), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation,
          expectedServiceAccount: serviceAccountEmail,
          actualServiceAccount: verified.email,
        },
      });
      return jsonError("Unauthorized", 401);
    }
    return null;
  } catch (error) {
    logError(
      error instanceof Error
        ? error
        : new Error("Cloud Scheduler OIDC token verification failed"),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation },
      },
    );
    return jsonError("Unauthorized", 401);
  }
}
