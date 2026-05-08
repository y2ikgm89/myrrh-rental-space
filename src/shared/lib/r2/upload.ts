/**
 * Cloudflare R2 ファイルアップロード（server-only）
 *
 * 設計方針（clean-break, server-side trust boundary 強制）:
 * - クライアント供給の `file.type` / `file.name` は **MIME / 拡張子の判定に使わない**
 * - server-side で magic-byte (12 byte signature) から MIME を確定させ、
 *   `Content-Type` / object key 拡張子の両方をその検出値から派生させる
 * - 現プロジェクトで扱うのは画像のみのため `FileValidation.allowedTypes` は
 *   `SupportedImageMimeType[]` に型 narrow 済（type-level で image-only を強制）
 * - 将来非画像（PDF / zip 等）を扱う場合は **別 upload 関数** + 別 magic-byte
 *   detector を新設する。`every()` や heuristic で image vs non-image を後付け
 *   分岐する設計には戻さない（fail-open のリスク）
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
  type SupportedImageMimeType,
} from "./image-magic-bytes";
import { buildPublicUrl, generateStorageKey, type StoragePrefix } from "./keys";

// =============================================================================
// Types
// =============================================================================

export type UploadResult =
  | {
      success: true;
      url: string;
      path: string;
      /** server-side 確定した MIME type（DB 永続用） */
      contentType: SupportedImageMimeType;
    }
  | { success: false; error: string };

/**
 * 画像 upload 用 validation。
 * `allowedTypes` は型レベルで `SupportedImageMimeType[]` に narrow されており、
 * 任意の MIME 文字列を渡せない（コンパイル時の image-only 強制）。
 */
export type ImageUploadValidation = {
  /** バイト単位の上限サイズ */
  maxSize: number;
  /** 許可する画像 MIME type のリスト（magic-byte 検出値と照合） */
  allowedTypes: readonly SupportedImageMimeType[];
};

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_VALIDATION: ImageUploadValidation = {
  maxSize: 5 * 1024 * 1024, // 5 MB
  allowedTypes: SUPPORTED_IMAGE_MIME_TYPES,
};

export const IMAGE_VALIDATION: ImageUploadValidation = {
  maxSize: 10 * 1024 * 1024, // 10 MB
  allowedTypes: SUPPORTED_IMAGE_MIME_TYPES,
};

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// =============================================================================
// Validation
// =============================================================================

/**
 * クライアントヒント（file.size のみ）に基づく事前ガード。
 * MIME / 拡張子は信用しない（後段の magic-byte 検証が trust boundary）。
 */
function preValidateSize(
  file: File,
  validation: ImageUploadValidation,
): string | null {
  if (file.size > validation.maxSize) {
    const maxSizeMB = Math.round(validation.maxSize / (1024 * 1024));
    return `ファイルサイズは${maxSizeMB}MB以下にしてください`;
  }
  return null;
}

// =============================================================================
// Upload
// =============================================================================

type UploadOptions = {
  /** 任意のサブフォルダ（`isValidStorageFolder` を通過する値のみ） */
  folder?: string;
  /** デフォルトは {@link DEFAULT_VALIDATION} */
  validation?: ImageUploadValidation;
  /** デフォルトは Cloudflare CDN 向け immutable long-cache */
  cacheControl?: string;
};

/**
 * 画像 File を R2 にアップロードする。
 *
 * 処理順序:
 * 1. file.size の事前ガード（safe early reject）
 * 2. arrayBuffer 化 → magic-byte で MIME 確定
 * 3. 検出 MIME が `validation.allowedTypes` 内かを照合
 * 4. 検出 MIME 由来の拡張子で object key 生成
 * 5. R2 へ送信（`Content-Type` も検出値）
 *
 * @returns success 時は `{ url, path, contentType }` を返す
 *   （`contentType` は server-side 確定値 — DB 永続化に使う canonical 値）
 */
export async function uploadFile(
  file: File,
  prefix: StoragePrefix,
  options?: UploadOptions,
): Promise<UploadResult> {
  const validation = options?.validation ?? DEFAULT_VALIDATION;

  const sizeError = preValidateSize(file, validation);
  if (sizeError) {
    return { success: false, error: sizeError };
  }

  const publicUrl = serverEnv.R2_PUBLIC_URL;
  if (!publicUrl) {
    return {
      success: false,
      error: "R2_PUBLIC_URL is not configured",
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    // server-side の trust boundary: magic-byte で MIME を確定する
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
        error: `許可されていない画像形式です（検出: ${detected}）`,
      };
    }

    const key = generateStorageKey({
      prefix,
      contentType: detected,
      ...(options?.folder !== undefined && { folder: options.folder }),
    });

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: body,
        ContentType: detected,
        CacheControl: options?.cacheControl ?? DEFAULT_CACHE_CONTROL,
        ContentLength: file.size,
      }),
    );

    return {
      success: true,
      url: buildPublicUrl(key, publicUrl),
      path: key,
      contentType: detected,
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
