/**
 * Cloudflare R2 ファイルダウンロード（server-only、private bucket 専用）
 *
 * `GetObjectCommand` の応答 body を Web `ReadableStream` に変換し、Next.js
 * Route Handler の `Response` にそのまま渡せる形で返す（`transformToWebStream()`
 * は `@aws-sdk/client-s3` 3.735.0+ で stream 未終端 bug が修正済み、本プロジェクトは
 * 3.1075+ を使用）。
 *
 * bucket を明示引数で受け取る設計（`getR2BucketName()` のような固定 bucket
 * ヘルパーに依存しない）にすることで、公開メディア bucket と private な
 * お問い合わせ添付 bucket を呼び出し側で確実に区別させる。
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 * @see https://github.com/aws/aws-sdk-js-v3/issues/6827
 */

import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getR2Client } from "./client";

export type ObjectStreamResult =
  | {
      success: true;
      body: ReadableStream;
      contentType: string | undefined;
      contentLength: number | undefined;
    }
  | { success: false; error: string };

/**
 * 指定 bucket / key の Object を Web ReadableStream として取得する。
 * Object が存在しない、または応答 body が空の場合は失敗を返す。
 */
export async function getObjectStream(
  bucket: string,
  key: string,
): Promise<ObjectStreamResult> {
  try {
    const result = await getR2Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!result.Body) {
      return { success: false, error: "対象のファイルが見つかりません" };
    }

    return {
      success: true,
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "getObjectStream", bucket, key },
    });
    return { success: false, error: "ファイルの取得に失敗しました" };
  }
}

/**
 * ダウンロード用の `Content-Disposition` ヘッダー値を組み立てる。
 *
 * アップロード元 filename は利用者入力（日本語含む）を保持するため、
 * ASCII-only の `filename=` fallback と RFC 5987 の `filename*=UTF-8''<pct-encoded>`
 * を併記する（RFC 6266 準拠。旧ブラウザは fallback を、モダンブラウザは
 * `filename*` を優先して正しいファイル名で保存する）。
 */
export function buildAttachmentContentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}
