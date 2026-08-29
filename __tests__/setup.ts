/**
 * テストグローバルセットアップ
 *
 * - 環境変数の設定
 * - グローバルモックの登録
 */

import { mock } from "bun:test";
import { installConsoleGuard } from "./helpers/console-guard";
import { setNodeEnv } from "./helpers/env";

// React / jsdom の警告は成功したテストを落とさない。ランナーは成功ファイルの
// 本文を出さないので、警告は誰にも読まれずに積み上がる。落として気づかせる。
installConsoleGuard();

// server-only をテスト環境でno-opにする
// （server-only/index.js は throw するため、react-server 条件なしの Bun テストではモックが必要）
mock.module("server-only", () => ({}));

// 環境変数設定
setNodeEnv("test");
process.env["SKIP_ENV_VALIDATION"] = "true"; // @t3-oss/env バリデーションをスキップ
process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
process.env["BETTER_AUTH_SECRET"] = "test-secret-key-for-testing-only";
process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test";

// クライアント環境変数（テスト用ダミー値）
process.env["NEXT_PUBLIC_BASE_URL"] = "http://localhost:3000";
process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";

// `crypto.ts` は `@/shared/lib/env/encryption` の
// `getPrimaryEncryptionKey()` / `resolveEncryptionKeyByKid()` 経由で
// `serverEnv.ENCRYPTION_KEY` (+ kid) と `SECONDARY_ENCRYPTION_KEYS` を読む。
// `serverEnv` はモジュールロード時 snapshot を取る公式仕様のため、test 環境では
// helper を `mock.module` で固定値に置換 (個別 test の異常系で動的 override 可能)。
//
// 新規 export を追加した場合は本 mock も同時に更新すること。crypto.ts の
// import に対応する mock export が欠落すると、crypto を transitive にロードする
// 全 test file が undefined 参照で fail する (39 file 一斉失敗の再発防止)。
const TEST_PRIMARY_KEY = { kid: "v1", hex: "a".repeat(64) };
class EncryptionKeyNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "EncryptionKeyNotConfiguredError";
  }
}
mock.module("@/shared/lib/env/encryption", () => ({
  getPrimaryEncryptionKey: () => TEST_PRIMARY_KEY,
  getSecondaryEncryptionKeys: () => [],
  resolveEncryptionKeyByKid: (kid: string) =>
    kid === TEST_PRIMARY_KEY.kid ? TEST_PRIMARY_KEY : null,
  EncryptionKeyNotConfiguredError,
}));

export {};
