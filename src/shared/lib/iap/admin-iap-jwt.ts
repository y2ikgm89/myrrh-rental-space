import "server-only";

import { OAuth2Client } from "google-auth-library";
import { serverEnv } from "@/shared/lib/env/server";

const IAP_ISSUER = "https://cloud.google.com/iap";

let oauthClient: OAuth2Client | null = null;

export type VerifiedIapJwt = {
  email: string;
  subject: string;
};

function getOAuthClient(): OAuth2Client {
  oauthClient ??= new OAuth2Client();
  return oauthClient;
}

export async function verifyIapJwt(jwt: string): Promise<VerifiedIapJwt> {
  const audience = serverEnv.IAP_JWT_AUDIENCE;
  if (!audience) {
    throw new Error("IAP_JWT_AUDIENCE is not configured");
  }

  const client = getOAuthClient();
  const certs = await client.getIapCerts();
  const ticket = await client.verifySignedJwtWithCertsAsync(
    jwt,
    certs.pubkeys,
    audience,
    [IAP_ISSUER],
  );
  const payload = ticket.getPayload();
  const email = payload?.email;
  const subject = payload?.sub;

  if (!email) {
    throw new Error("IAP JWT email claim is missing");
  }
  if (!subject) {
    throw new Error("IAP JWT subject claim is missing");
  }

  return { email, subject };
}
