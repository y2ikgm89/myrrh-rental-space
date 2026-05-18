/**
 * Encryption key 取得 SSoT helper
 *
 * `crypto.ts` の `getMasterKey()` から `process.env["ENCRYPTION_KEY"]` 直参照を
 * 排除し `serverEnv` 経由化するための boundary helper。
 *
 * `@t3-oss/env-nextjs` の `serverEnv` はモジュールロード時 snapshot を取るため
 * runtime 動的変更を受け付けない (公式仕様)。test で「ENCRYPTION_KEY 未設定」
 * シナリオを検証する場合は本 helper を `mock.module` で差し替える:
 *
 * ```ts
 * const mockGetEncryptionKey = mock<() => string>(() => testKey);
 * mock.module("@/shared/lib/env/encryption", () => ({
 *   getEncryptionKey: mockGetEncryptionKey,
 * }));
 * // 異常系: mockGetEncryptionKey.mockImplementationOnce(() => {
 * //   throw new Error("ENCRYPTION_KEY is not set...");
 * // });
 * ```
 */

import "server-only";

import { serverEnv } from "./server";

/**
 * 暗号化マスター鍵 (`ENCRYPTION_KEY`) を取得。
 *
 * `serverEnv` の `.length(64)` 検証は `validateProductionEnv()` で本番起動時に
 * 強制される。本 helper は development / test で未設定の場合のみ throw する
 * (production は startup で fail-fast されるため未到達)。
 */
export function getEncryptionKey(): string {
  const key = serverEnv.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32",
    );
  }
  return key;
}
