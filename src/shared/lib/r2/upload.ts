/**
 * Cloudflare R2 ファイルアップロード（server-only）
 *
 * PutObjectCommand で `Body: Uint8Array` を送信する。File → arrayBuffer → Uint8Array
 * 変換により、@aws-sdk/client-s3 の Node.js runtime で確実に動作する（File / Blob
 * の直接渡しはバージョンによって挙動が変わるため、Uint8Array に正規化する）。
 *
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 * @see https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/EFFECTIVE_PRACTICES.md
 */

import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { serverEnv } from "@/shared/lib/env/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getR2BucketName, getR2Client } from "./client";
import {
  detectImageMimeFromMagicBytes,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "./image-magic-bytes";
import { buildPublicUrl, generateStorageKey, type StoragePrefix } from "./keys";

// =============================================================================
// Types
// =============================================================================

export type UploadResult = {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
};

export type FileValidation = {
  /** バイト単位の上限サイズ */
  maxSize: number;
  /** 許可する MIME type のリスト */
  allowedTypes: string[];
};

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_VALIDATION: FileValidation = {
  maxSize: 5 * 1024 * 1024, // 5 MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

export const IMAGE_VALIDATION: FileValidation = {
  maxSize: 10 * 1024 * 1024, // 10 MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// =============================================================================
// Validation
// =============================================================================

/**
 * File を validation 規則に照らしてエラーメッセージ（問題あり）または null（OK）を返す。
 */
export function validateFile(
  file: File,
  validation: FileValidation,
): string | null {
  if (file.size > validation.maxSize) {
    const maxSizeMB = Math.round(validation.maxSize / (1024 * 1024));
    return `ファイルサイズは${maxSizeMB}MB以下にしてください`;
  }

  if (!validation.allowedTypes.includes(file.type)) {
    return `対応していないファイル形式です。対応形式: ${validation.allowedTypes.join(
      ", ",
    )}`;
  }

  return null;
}

// =============================================================================
// Upload
// =============================================================================

type UploadOptions = {
  /** 任意のサブフォルダ（prefix 配下のスコープ）*/
  folder?: string;
  /** デフォルトは {@link DEFAULT_VALIDATION} */
  validation?: FileValidation;
  /** デフォルトは Cloudflare CDN 向け immutable long-cache */
  cacheControl?: string;
};

/**
 * 単一 File を R2 にアップロードする。
 *
 * @returns `{ success, url, path, error }` — `success: true` 時のみ `url` / `path` が存在。
 */
export async function uploadFile(
  file: File,
  prefix: StoragePrefix,
  options?: UploadOptions,
): Promise<UploadResult> {
  const validation = options?.validation ?? DEFAULT_VALIDATION;

  const validationError = validateFile(file, validation);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const publicUrl = serverEnv.R2_PUBLIC_URL;
  if (!publicUrl) {
    return {
      success: false,
      error: "R2_PUBLIC_URL is not configured",
    };
  }

  try {
    const key = generateStorageKey({
      prefix,
      filename: file.name,
      ...(options?.folder && { folder: options.folder }),
    });

    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    // 画像 upload では magic-byte 検証で MIME type を server-side 確定する
    // （クライアント供給の file.type はブラウザで偽装可能 → XSS / cache-poisoning 経路）。
    // 非画像 prefix（例: PDF 等）は将来拡張時に分岐する。
    const isImageUpload = (validation.allowedTypes as readonly string[]).every(
      (t) =>
        SUPPORTED_IMAGE_MIME_TYPES.includes(
          t as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number],
        ),
    );
    let resolvedContentType: string = file.type;
    if (isImageUpload) {
      const detected = detectImageMimeFromMagicBytes(body);
      if (!detected) {
        return {
          success: false,
          error:
            "ファイルの中身が画像として認識できません。対応形式（JPEG / PNG / WebP / GIF）でアップロードしてください。",
        };
      }
      if (!validation.allowedTypes.includes(detected)) {
        return {
          success: false,
          error: `この拠点で許可されていない画像形式です（検出: ${detected}）`,
        };
      }
      resolvedContentType = detected;
    }

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: body,
        ContentType: resolvedContentType,
        CacheControl: options?.cacheControl ?? DEFAULT_CACHE_CONTROL,
        ContentLength: file.size,
      }),
    );

    return {
      success: true,
      url: buildPublicUrl(key, publicUrl),
      path: key,
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "uploadFile", prefix },
    });
    return {
      success: false,
      error: "ファイルのアップロードに失敗しました",
    };
  }
}

/**
 * 複数 File を順次アップロードする。失敗時は短絡し、成功分のみ results に残す。
 */
export async function uploadFiles(
  files: File[],
  prefix: StoragePrefix,
  options?: UploadOptions,
): Promise<{
  success: boolean;
  results: UploadResult[];
  error?: string;
}> {
  const results: UploadResult[] = [];

  for (const file of files) {
    const result = await uploadFile(file, prefix, options);
    results.push(result);

    if (!result.success) {
      return {
        success: false,
        results,
        error: `ファイル "${file.name}" のアップロードに失敗しました: ${result.error}`,
      };
    }
  }

  return { success: true, results };
}
