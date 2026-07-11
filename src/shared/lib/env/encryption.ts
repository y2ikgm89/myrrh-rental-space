/**
 * Encryption key 取得 SSoT helper（primary + secondary read window）
 *
 * `crypto.ts` の `getMasterKey()` から `process.env["ENCRYPTION_KEY"]` 直参照を
 * 排除し `serverEnv` 経由化するための boundary helper。
 *
 * ## 鍵モデル
 *
 * - **Primary**: `ENCRYPTION_KEY` (hex64) + `ENCRYPTION_KEY_ID` (kid, default "v1")
 *   新規 encrypt は常に primary で書く。
 * - **Secondary (rotation window)**: `SECONDARY_ENCRYPTION_KEYS` に
 *   `kid:hex64` を `,` で連結した文字列。**復号のみ**に使う。
 *
 *     SECONDARY_ENCRYPTION_KEYS="v1:abc...,v0:def..."
 *
 *   運用フロー: 新 primary をデプロイする際、旧 primary を secondary に
 *   移して両読み窓を開く → バッチで旧 kid の暗号文を新 primary に再暗号化
 *   → secondary を空にして窓を閉じる。詳細は
 *   [docs/runbooks/encryption-key-rotation.md](../../../docs/runbooks/encryption-key-rotation.md)。
 *
 * `@t3-oss/env-nextjs` の `serverEnv` はモジュールロード時 snapshot を取るため
 * runtime 動的変更を受け付けない。test で鍵未設定シナリオを検証する場合は本
 * helper を `mock.module` で差し替える。
 */

import "server-only";

import { serverEnv } from "./server";
import { parseSecondaryEncryptionKeys } from "./parse-secondary-encryption-keys";
import type { EncryptionKey as ParsedEncryptionKey } from "./parse-secondary-encryption-keys";

/** デフォルト kid（`ENCRYPTION_KEY_ID` 未指定時）。 */
export const DEFAULT_KID = "v1";

export type EncryptionKey = ParsedEncryptionKey;

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

/**
 * Rotation 用の読み取り専用 secondary key 一覧。 encrypt には使わない。
 *
 * 実際の parse は `parseSecondaryEncryptionKeys()` (pure function) に委譲する。
 * validation は `validateProductionEnv()` が起動時に呼んで fail-fast させる。
 */
export function getSecondaryEncryptionKeys(): EncryptionKey[] {
  return parseSecondaryEncryptionKeys(serverEnv.SECONDARY_ENCRYPTION_KEYS);
}

/**
 * decrypt が kid から鍵を引くための集約 lookup。primary を含む。
 *
 * 呼び出し側 (`crypto.ts`) は wire format 上の `kid` でこの map を lookup する。
 */
export function resolveEncryptionKeyByKid(kid: string): EncryptionKey | null {
  const primary = getPrimaryEncryptionKey();
  if (primary.kid === kid) return primary;

  for (const secondary of getSecondaryEncryptionKeys()) {
    if (secondary.kid === kid) return secondary;
  }

  return null;
}
