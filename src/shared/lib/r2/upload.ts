/**
 * Cloudflare R2 ファイルアップロード（server-only）
 *
 * 設計方針（clean-break, server-side trust boundary 強制）:
 * - クライアント供給の `file.type` / `file.name` は **MIME / 拡張子の判定に使わない**
 * - server-side で magic-byte (12 byte signature) から MIME を確定させ、
 *   `Content-Type` / object key 拡張子の両方をその検出値から派生させる
 * - 画像 / 動画 / 音声 / 文書を 1 つの `uploadFile` で扱う。MIME カテゴリ別の
 *   許可 list (`validation.allowedTypes`) + 個別 size 上限を呼び出し側が宣言する
 * - 検出値が `validation.allowedTypes` 外 / size 上限超 → 拒否（fail-closed）
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
  detectMediaMimeFromMagicBytes,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_MEDIA_MIME_TYPES,
  type SupportedImageMimeType,
  type SupportedMediaMimeType,
} from "./media-magic-bytes";
import { MEDIA_MAX_SIZE_BYTES } from "./media-size";
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
      contentType: SupportedMediaMimeType;
    }
  | { success: false; error: string };

/**
 * メディア upload 用 validation。
 *
 * `allowedTypes` は呼び出し側で**カテゴリを宣言**する役割を持つ
 * （image-only / video-only / image+video 等）。`maxSize` を省略すると
 * 各 allowed type の `MEDIA_MAX_SIZE_BYTES` の**最大値**が暗黙適用される。
 */
export type MediaUploadValidation = {
  /** 全体の上限 size（bytes）。省略時は allowedTypes 内の最大値 */
  maxSize?: number;
  /** 許可する MIME type のリスト（magic-byte 検出値と照合） */
  allowedTypes: readonly SupportedMediaMimeType[];
};

// =============================================================================
// Constants
// =============================================================================

/** 画像のみを受け付ける明示エイリアス（OGP / hero / favicon 等） */
export const IMAGE_VALIDATION: MediaUploadValidation = {
  allowedTypes: SUPPORTED_IMAGE_MIME_TYPES,
};

/** 画像 / 動画 / 音声 / 文書すべて（メディアライブラリ / Lexical Inspector 用） */
export const MEDIA_VALIDATION: MediaUploadValidation = {
  allowedTypes: SUPPORTED_MEDIA_MIME_TYPES,
};

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// =============================================================================
// Validation helpers
// =============================================================================

/**
 * `validation.maxSize` が指定されていればそれを返し、未指定なら
 * `allowedTypes` 内の `MEDIA_MAX_SIZE_BYTES` 最大値を返す。
 */
function resolveAggregateMaxSize(validation: MediaUploadValidation): number {
  if (validation.maxSize !== undefined) return validation.maxSize;
  return Math.max(
    ...validation.allowedTypes.map((mime) => MEDIA_MAX_SIZE_BYTES[mime]),
  );
}

/**
 * client.size hint に基づく事前ガード（trust boundary 前の早期 reject）。
 * MIME / 拡張子は信用しない（後段の magic-byte 検証が trust boundary）。
 */
function preValidateSize(
  file: File,
  validation: MediaUploadValidation,
): string | null {
  const maxSize = resolveAggregateMaxSize(validation);
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return `ファイルサイズは${maxSizeMB}MB以下にしてください`;
  }
  return null;
}

/**
 * MIME 検出後の per-type size 検証。
 * 動画 50MB / 音声 20MB / 画像 5MB / 文書 10MB の上限を MIME 別に強制。
 */
function validatePerTypeSize(
  fileSize: number,
  detectedMime: SupportedMediaMimeType,
): string | null {
  const limit = MEDIA_MAX_SIZE_BYTES[detectedMime];
  if (fileSize > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return `この形式 (${detectedMime}) は ${limitMB}MB 以下にしてください`;
  }
  return null;
}

// =============================================================================
// Upload
// =============================================================================

type UploadOptions = {
  /** 任意のサブフォルダ（`isValidStorageFolder` を通過する値のみ） */
  folder?: string;
  /** 呼び出し側が受け付ける MIME policy を必ず宣言する */
  validation: MediaUploadValidation;
  /** デフォルトは Cloudflare CDN 向け immutable long-cache */
  cacheControl?: string;
};

/**
 * メディア File を R2 にアップロードする。
 *
 * 処理順序:
 * 1. file.size の事前ガード（aggregate max — safe early reject）
 * 2. arrayBuffer 化 → magic-byte で MIME 確定
 * 3. 検出 MIME が `validation.allowedTypes` 内かを照合
 * 4. 検出 MIME に対応する per-type size 上限を検証
 * 5. 検出 MIME 由来の拡張子で object key 生成
 * 6. R2 へ送信（`Content-Type` も検出値）
 *
 * @returns success 時は `{ url, path, contentType }` を返す
 *   （`contentType` は server-side 確定値 — DB 永続化に使う canonical 値）
 */
export async function uploadFile(
  file: File,
  prefix: StoragePrefix,
  options: UploadOptions,
): Promise<UploadResult> {
  const validation = options.validation;

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
    const detected = detectMediaMimeFromMagicBytes(body);
    if (!detected) {
      return {
        success: false,
        error:
          "ファイルの中身が対応形式（画像 / 動画 / 音声 / PDF）として認識できません。",
      };
    }
    if (!validation.allowedTypes.includes(detected)) {
      return {
        success: false,
        error: `許可されていないファイル形式です（検出: ${detected}）`,
      };
    }

    const perTypeError = validatePerTypeSize(file.size, detected);
    if (perTypeError) {
      return { success: false, error: perTypeError };
    }

    const key = generateStorageKey({
      prefix,
      contentType: detected,
      ...(options.folder !== undefined && { folder: options.folder }),
    });

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: body,
        ContentType: detected,
        CacheControl: options.cacheControl ?? DEFAULT_CACHE_CONTROL,
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
  options: UploadOptions,
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

// =============================================================================
// Re-exports (consumer 側の barrel 化を抑えるため type のみ slim re-export)
// =============================================================================

export type { SupportedImageMimeType };
