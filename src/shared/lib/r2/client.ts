/**
 * Cloudflare R2 S3Client Singleton（server-only）
 *
 * - `globalThis` ベースの singleton（hot reload でのコネクション枯渇を防ぐ、
 *   Prisma と同じパターン）
 * - region は `"auto"`（Cloudflare R2 公式要件、SDK 側が region 値を要求するため）
 * - endpoint は Account ID ベースの R2 S3 API エンドポイント
 * - `forcePathStyle` は設定しない（Cloudflare 公式例に従い virtual-hosted を使用）
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 */

import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/shared/lib/env/server";

type GlobalStore = {
  r2Client?: S3Client;
};

declare global {
  // ambient global singleton store (HMR / cold start でのリーク防止)
  var __myrrhR2GlobalStore: GlobalStore | undefined;
}

const globalStore: GlobalStore = (globalThis.__myrrhR2GlobalStore ??= {});

/**
 * R2 S3 API エンドポイント URL を構築する。
 *
 * 例: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 *
 * @throws Error R2_ACCOUNT_ID が未設定の場合
 */
function buildR2Endpoint(): string {
  const accountId = serverEnv.R2_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      "R2_ACCOUNT_ID is not configured. Set it in the environment variables.",
    );
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * R2 S3Client を取得する（遅延初期化 + singleton）。
 *
 * モジュールロード時に credentials 欠損で失敗させると、
 * ビルド時や env 未設定のローカル環境でも import 可能にする。
 * 実際の send() 時点で存在しなければエラーになる。
 *
 * @throws Error R2 env が未設定の場合
 */
export function getR2Client(): S3Client {
  if (globalStore.r2Client) return globalStore.r2Client;

  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials are not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: buildR2Endpoint(),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  globalStore.r2Client = client;
  return client;
}

/**
 * R2 バケット名（env から取得、未設定時は throw）。
 * PutObjectCommand / DeleteObjectCommand の Bucket パラメータで使用する。
 */
export function getR2BucketName(): string {
  const bucket = serverEnv.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error(
      "R2_BUCKET_NAME is not configured. Set it in the environment variables.",
    );
  }
  return bucket;
}

/**
 * お問い合わせ添付専用の private R2 バケット名（env から取得、未設定時は throw）。
 *
 * `R2_BUCKET_NAME`（メディアライブラリ用の公開 CDN バケット）とは別バケット。
 * PII を含む添付ファイルを公開 CDN に混在させない設計方針（inquiry-overhaul
 * completion design §5.2）のため、bucket 自体を分離し `buildPublicUrl` を
 * 一切呼ばない private-only 経路にする。credentials（account/access key/secret）
 * は既存 R2 アカウントを共有する。
 */
export function getR2InquiriesBucketName(): string {
  const bucket = serverEnv.R2_INQUIRIES_BUCKET_NAME;
  if (!bucket) {
    throw new Error(
      "R2_INQUIRIES_BUCKET_NAME is not configured. Set it in the environment variables.",
    );
  }
  return bucket;
}
