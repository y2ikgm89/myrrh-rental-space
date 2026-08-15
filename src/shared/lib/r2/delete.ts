/**
 * Cloudflare R2 ファイル削除（server-only）
 *
 * - `deleteFile(key)`: 単一 Object を DeleteObjectCommand で削除
 * - `deleteFiles(keys)`: 複数 Object を DeleteObjectsCommand で一括削除
 *
 * AWS/R2 DeleteObjects は 1 call あたり 1000 Object が上限。呼び出し側の件数に
 * 依らず、このモジュールで 1000 件ずつ chunk して送る。
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 */

import "server-only";

import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getR2BucketName, getR2Client } from "./client";

type DeleteResult = { success: boolean; error?: string };

/** AWS/R2 DeleteObjects の 1 リクエスト上限。呼び出し側ではなくここが正本。 */
const DELETE_OBJECTS_MAX_KEYS = 1000;

async function sendDeleteObjects(
  bucket: string,
  keys: string[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_OBJECTS_MAX_KEYS) {
    const chunk = keys.slice(i, i + DELETE_OBJECTS_MAX_KEYS);
    await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

/**
 * 単一 Object を削除する。
 */
export async function deleteFile(key: string): Promise<DeleteResult> {
  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
    );
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteFile", key },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}

/**
 * 複数 Object を一括削除する（S3 DeleteObjects API、1000 件超は chunk）。
 * 空配列は no-op（success:true）。
 */
export async function deleteFiles(keys: string[]): Promise<DeleteResult> {
  if (keys.length === 0) return { success: true };

  try {
    await sendDeleteObjects(getR2BucketName(), keys);
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteFiles", count: keys.length },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}

/**
 * 任意 bucket から単一 Object を削除する（private bucket 専用）。
 * `deleteFile` は `R2_BUCKET_NAME`（公開メディア bucket）固定のため、
 * お問い合わせ添付など別 bucket の object には使えない。
 */
export async function deleteObjectFromBucket(
  bucket: string,
  key: string,
): Promise<DeleteResult> {
  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteObjectFromBucket", bucket, key },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}

/**
 * 任意 bucket から複数 Object を一括削除する（private bucket 専用、1000 件超は chunk）。
 * 空配列は no-op（success:true）。
 */
export async function deleteObjectsFromBucket(
  bucket: string,
  keys: string[],
): Promise<DeleteResult> {
  if (keys.length === 0) return { success: true };

  try {
    await sendDeleteObjects(bucket, keys);
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "deleteObjectsFromBucket",
        bucket,
        count: keys.length,
      },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}
