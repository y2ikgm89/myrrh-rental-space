/**
 * Cloudflare R2 ファイル削除（server-only）
 *
 * - `deleteFile(key)`: 単一 Object を DeleteObjectCommand で削除
 * - `deleteFiles(keys)`: 複数 Object を DeleteObjectsCommand で一括削除（1 API call）
 *
 * bulk 削除は AWS S3 API の上限 1000 件/call 以内を想定。このプロジェクトは
 * 画像アップロードのみで 1000 件を超える同時削除は発生しないため chunking しない。
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
 * 複数 Object を一括削除する（S3 DeleteObjects API、最大 1000 件）。
 * 空配列は no-op（success:true）。
 */
export async function deleteFiles(keys: string[]): Promise<DeleteResult> {
  if (keys.length === 0) return { success: true };

  try {
    await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: getR2BucketName(),
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
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
