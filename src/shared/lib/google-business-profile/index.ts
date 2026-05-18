/**
 * Google Business Profile 連携の barrel。
 *
 * Server Component / Server Action / Domain command から import する。
 * googleapis SDK 等の Node-only 依存を含むため `import "server-only"` を強制する。
 */

import "server-only";

export { syncLocationToGbp } from "./location-sync";
export {
  getGbpAuthState,
  saveGbpAuthState,
  clearGbpAuthState,
} from "@/shared/domain/google-business-profile/settings";
export { listGbpAccounts } from "./account";
export type { GbpAccount } from "./account";
export {
  getGbpAuthorizeUrl,
  exchangeGbpAuthCode,
  revokeGbpToken,
  GBP_OAUTH_STATE_COOKIE,
  GBP_OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
} from "./oauth";
export { createOAuth2Client, getGbpClient, GBP_SCOPES } from "./client";
export type {
  GbpAuthState,
  GbpDayOfWeek,
  GbpLocationPayload,
  GbpRegularHours,
  GbpSyncInput,
  GbpSyncResult,
  GbpTimePeriod,
} from "./types";
