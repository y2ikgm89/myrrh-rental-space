import type { ReactElement } from "react";
import { headers } from "next/headers";
import { RegisterStyleNonce } from "./register-style-nonce";

/**
 * `x-nonce`（proxy が発行）をクライアントの `get-nonce` グローバルへ渡す server 側の橋渡し。
 *
 * `headers()` は dynamic API なので **`<Suspense>` の内側**に置くこと
 * （root layout 本体に直置きすると cacheComponents がビルドを落とす）。
 * 詳細は `RegisterStyleNonce` の JSDoc。
 */
export async function StyleNonceRegistrar(): Promise<ReactElement | null> {
  const nonce = (await headers()).get("x-nonce");
  if (!nonce) return null;

  return <RegisterStyleNonce nonce={nonce} />;
}
