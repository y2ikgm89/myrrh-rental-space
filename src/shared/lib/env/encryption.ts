/**
 * Encryption key 取得 SSoT helper（kid + legacy fallback 対応）
 *
 * `crypto.ts` の `getMasterKey()` から `process.env["ENCRYPTION_KEY"]` 直参照を
 * 排除し `serverEnv` 経由化するための boundary helper。
 *
 * ## 鍵モデル
 *
 * - **Primary**: `ENCRYPTION_KEY` (hex64) + `ENCRYPTION_KEY_ID` (kid, default "v1")
 *   新規 encrypt は常に primary で書く。
 * - **Legacy fallback**: `ENCRYPTION_KEYS_LEGACY="<kid>:<hex>,<kid>:<hex>"`
 *   旧 ciphertext は payload 内 kid に従って該当鍵で復号する。ローテーション猶予期間中に
 *   at-rest re-encrypt を進め、移行後に environment から外す。
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

/**
 * Legacy 鍵リストを取得。`ENCRYPTION_KEYS_LEGACY="kidA:hexA,kidB:hexB"` を parse。
 * decrypt fallback 用。同一 kid が primary とも legacy にも存在する場合は primary が勝つ。
 */
export function getLegacyEncryptionKeys(): EncryptionKey[] {
  const raw = serverEnv.ENCRYPTION_KEYS_LEGACY;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [kid, hex] = entry.split(":");
      if (!kid || !hex) {
        throw new Error(
          `Invalid ENCRYPTION_KEYS_LEGACY entry: "${entry}". Expected <kid>:<hex64>.`,
        );
      }
      return { kid, hex };
    });
}

/**
 * 指定 kid に該当する鍵を返す。primary → legacy の順で探す。
 * 該当鍵がなければ null（caller が decrypt 失敗として扱う）。
 */
export function findEncryptionKeyByKid(kid: string): EncryptionKey | null {
  const primary = getPrimaryEncryptionKey();
  if (primary.kid === kid) return primary;
  for (const legacy of getLegacyEncryptionKeys()) {
    if (legacy.kid === kid) return legacy;
  }
  return null;
}
