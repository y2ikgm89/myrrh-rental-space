/**
 * Server Action の `bodySizeLimit` が、アプリが受け付けると謳っている
 * 最大アップロードサイズを下回らないことを、**解決後の** Next.js 設定で固定する。
 *
 * ## なぜ
 *
 * この gate は実際に main へ漏れた欠陥に対して置いている。
 * `uploadInquiryAttachment` と `uploadMedia` は Server Action で `File` を
 * 受け取り、アプリ側は動画 50MB / 音声 20MB / PDF 10MB / 画像 5MB まで受け付ける
 * 建て付けだった。一方 `bodySizeLimit` は未設定で、Next の既定は 1MB
 * （16.3.0 同梱 docs の `serverActions` 節:
 * "the maximum size of the request body sent to a Server Action is 1MB"）。
 *
 * 上限を超えるとフレームワークが request 自体を弾くため、action は返らない。
 * 呼出側の `isMutationError` にも到達せず、**画面には何も出ない**。
 * 「2MB の PDF を添付すると無言で失敗する」という形で表面化していた。
 *
 * ## 何を見るか
 *
 * `next.config.ts` の中身ではなく、Next.js 自身の `loadConfig` を通した
 * **解決後の値**を見る。`next.config.ts` は TS で SSoT から導出しているので、
 * ソースを grep しても実際に効く数値は分からない。
 *
 * なお `loadConfig` は既定値を埋めない（未設定なら解決後も `undefined`）。
 * 1MB は request 処理時に当たる:
 * `next/dist/server/app-render/action-handler.js` が
 * `serverActions?.bodySizeLimit ?? defaultBodySizeLimit` を取り、未設定側では
 * `1024 * 1024` を使って超過時に `ApiError(413, "Body exceeded ... limit.")` を投げる。
 * したがって gate が見るのは「明示値が入っていて、かつ十分大きいこと」になる。
 *
 * 比較相手は SSoT の `LARGEST_UPLOAD_BYTES`。数値を書き写さないので、
 * per-MIME 上限（`MEDIA_MAX_SIZE_BYTES`）を動かせばこの gate の期待値も一緒に動く。
 *
 * 見本は一時ディレクトリの実 config を同じ loader に通して作る。
 * 「未設定 → `undefined` のまま（＝実行時に 1MB が当たる形）」と
 * 「明示値 → その値が素通りする（落ちてはいけない形）」の 2 本で、
 * loader が既定を埋めないことと、この gate に判別力があることを示す。
 *
 * ## 直し方
 *
 * 落ちたら、`next.config.ts` の `experimental.serverActions.bodySizeLimit` が
 * 消えているか、アプリ側の受け入れ上限が `bodySizeLimit` を追い越している。
 * 前者は復活させる。後者は `SERVER_ACTION_BODY_SIZE_LIMIT_BYTES`
 * （`src/shared/lib/r2/inquiry-attachment.ts`）が導出元なので、そこが
 * 追随できていない理由を先に読む。**期待値の側を下げて通さない** — 下げた瞬間に
 * 「正当なアップロードが無言で失敗する」状態へ戻る。
 *
 * **`bodySizeLimit` を特定経路の上限から導かない。** 一度それをやって
 * 問い合わせ添付（10MB）基準にした結果、同じ Server Action 経路のメディア
 * アップロード（動画 50MB）が無言で 413 のまま残った。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import { MEDIA_MAX_SIZE_BYTES } from "@/shared/lib/r2/media-size";

/**
 * Server Action で受けうる最大ファイル。**問い合わせ添付ではなくメディア全体の
 * 最大値**（動画 50MB）。`uploadMedia` も Server Action で、client 3 箇所から
 * 呼ばれる（同名の Route Handler は存在するが GET しか使われていない）。
 */
const LARGEST_UPLOAD_BYTES = Math.max(...Object.values(MEDIA_MAX_SIZE_BYTES));

/** request 時に当たる既定（`action-handler.js`）。config には現れない。 */
const NEXT_RUNTIME_DEFAULT_BYTES = 1024 * 1024;

type ResolvedNextConfig = {
  experimental: { serverActions?: { bodySizeLimit?: number | string } };
};

type LoadConfig = (phase: string, dir: string) => Promise<ResolvedNextConfig>;

async function getLoadConfig(): Promise<LoadConfig> {
  const mod: unknown = await import("next/dist/server/config.js");
  if (typeof mod !== "object" || mod === null || !("default" in mod)) {
    throw new Error("next/dist/server/config.js has no default export");
  }
  const { default: exported } = mod;
  // CJS interop: bun may hand back either the function or a { default } wrapper.
  const candidate =
    typeof exported === "function"
      ? exported
      : typeof exported === "object" &&
          exported !== null &&
          "default" in exported
        ? exported.default
        : undefined;
  if (typeof candidate !== "function") {
    throw new Error("Could not resolve next loadConfig");
  }
  return candidate as LoadConfig;
}

const createdDirs: string[] = [];

function writeFixtureConfig(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "next-server-action-body-size-"));
  createdDirs.push(dir);
  writeFileSync(join(dir, "next.config.js"), `module.exports = { ${body} }`);
  return dir;
}

afterAll(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("next.config: Server Action bodySizeLimit", () => {
  test("このリポジトリの解決値は、受け付けると謳っている最大サイズ以上", async () => {
    const loadConfig = await getLoadConfig();
    const config = await loadConfig("phase-production-build", process.cwd());

    const limit = config.experimental.serverActions?.bodySizeLimit;
    // 数値で持つ（`'12mb'` のような文字列だとここで比較できず、
    // 「設定はあるが小さい」を見逃す）。
    expect(typeof limit).toBe("number");
    expect(limit).toBeGreaterThanOrEqual(LARGEST_UPLOAD_BYTES);
  });

  test("見本: 未設定は解決後も undefined のまま（= 実行時に 1MB が当たる、落ちるべき形）", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig("");

    const config = await loadConfig("phase-production-build", dir);

    // config 側には既定が入らない。だから「設定を消しても config は緑」という
    // 形にはできず、上の本番 assert（number であること）が唯一の関門になる。
    expect(config.experimental.serverActions?.bodySizeLimit).toBeUndefined();
    // かつ、実行時に当たる既定はアプリの受け入れ上限に足りない（gate の存在理由）。
    expect(LARGEST_UPLOAD_BYTES).toBeGreaterThan(NEXT_RUNTIME_DEFAULT_BYTES);
  });

  test("見本: 明示値は loader を素通りする（落ちてはいけない形）", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig(
      "experimental: { serverActions: { bodySizeLimit: 12345678 } }",
    );

    const config = await loadConfig("phase-production-build", dir);

    expect(config.experimental.serverActions?.bodySizeLimit).toBe(12345678);
  });
});
