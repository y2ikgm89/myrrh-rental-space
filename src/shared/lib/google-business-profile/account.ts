/**
 * Google Business Profile アカウント取得。
 *
 * `mybusinessaccountmanagement` v1 の `accounts.list` を retry 付きで呼び出し、
 * UI 表示・選択用に最小化した形で返す。
 */

import "server-only";

import { google } from "googleapis";

import { withGbpApiRetry } from "./retry";

export type GbpAccount = {
  readonly accountId: string;
  readonly accountName: string;
};

/**
 * 認証済み OAuth2Client から GBP アカウント一覧を取得する。
 *
 * 戻り値は `accountId`（`accounts/{id}` 形式の resource name）と表示用の `accountName`。
 */
export async function listGbpAccounts(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
): Promise<readonly GbpAccount[]> {
  const client = google.mybusinessaccountmanagement({
    version: "v1",
    auth: oauth2Client,
  });

  const response = await withGbpApiRetry(() => client.accounts.list({}));
  const accounts = response.data.accounts ?? [];

  return accounts.map((acc) => ({
    accountId: acc.name ?? "",
    accountName: acc.accountName ?? "Unknown Account",
  }));
}
