/**
 * Encryption key 取得 SSoT helper（primary key only）
 *
 * `crypto.ts` の `getMasterKey()` から `process.env["ENCRYPTION_KEY"]` 直参照を
 * 排除し `serverEnv` 経由化するための boundary helper。
 *
 * ## 鍵モデル
 *
 * - **Primary**: `ENCRYPTION_KEY` (hex64) + `ENCRYPTION_KEY_ID` (kid, default "v1")
 *   新規 encrypt は常に primary で書く。
 *
 * `@t3-oss/env-nextjs` の `serverEnv` はモジュールロード時 snapshot を取るため
 * runtime 動的変更を受け付けない。test で「ENCRYPTION_KEY 未設定」シナリオを検証する
 * 場合は本 helper を `mock.module` で差し替える。
 */

import "server-only";

import { serverEnv } from "./server";

/** デフォルト kid（`ENCRYPTION_KEY_ID` 未指定時）。 */
export const DEFAULT_KID = "v1";

export interface EncryptionKey {
  kid: string;
  /** 32 バイトのマスター鍵（hex64 を変換した buffer 元の hex 文字列）。 */
  hex: string;
}

/**
 * 暗号化マスター鍵（primary）を取得。新規 encrypt はこの鍵で書く。
 *
 * `serverEnv` の `.length(64)` 検証は `validateProductionEnv()` で本番起動時に
 * 強制される。本 helper は development / test で未設定の場合のみ throw する
 * (production は startup で fail-fast されるため未到達)。
 */
export function getPrimaryEncryptionKey(): EncryptionKey {
  const hex = serverEnv.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32",
    );
  }
  const kid = serverEnv.ENCRYPTION_KEY_ID ?? DEFAULT_KID;
  return { kid, hex };
}
