/**
 * Zod 4 のグローバル日本語ロケール。
 *
 * conform は空欄を `undefined` に畳む。`z.string().min(1, { error: "…" })` の
 * 日本語は `.min(1)` にしか付かないため、未入力は外側 `z.string()` の
 * `invalid_type` で落ち、Zod 既定の
 * `Invalid input: expected string, received undefined` がフォームに出る
 * （#1835 の欠陥クラス）。フィールド単位の `error` 指定はモグラ叩きなので、
 * ここで既定メッセージ自体を日本語化する。
 *
 * フィールド別 `error` 指定はロケールより優先される。既存の日本語メッセージは
 * このモジュールを載せるだけでは変わらない。
 *
 * 評価される場所:
 * - server: `src/instrumentation.ts` の top-level import（Server Action /
 *   RSC / Route Handler。edge も含む）
 * - client: `ZodJaRegistrar`（両 root layout が描画）
 */
import { z } from "zod";

z.config(z.locales.ja());
