/**
 * ファイルストレージサービス
 *
 * Supabase Storageを使用したファイルアップロード・削除機能を提供します。
 * スペース画像、ブログ画像、サイト設定画像などの管理に使用します。
 *
 * ## 機能
 * - **ファイルアップロード**: 単一・複数ファイル対応
 * - **ファイル削除**: 単一・複数ファイル対応
 * - **専用アップロード**: スペース画像、ブログ画像、サイト画像
 * - **バリデーション**: ファイルサイズ、ファイル形式チェック
 *
 * ## バケット
 * - `spaces`: スペース画像用
 * - `posts`: 投稿画像用
 * - `site`: サイト設定画像（ロゴ・ファビコン・OGP）
 *
 * @module shared/lib/storage
 */

import { supabase, isSupabaseConfigured, STORAGE_BUCKETS, type StorageBucket } from './supabase'
import { v4 as uuid } from 'uuid'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from './errors'

// =============================================================================
// Types
// =============================================================================

export type UploadResult = {
  success: boolean
  url?: string
  path?: string
  error?: string
}

export type FileValidation = {
  maxSize: number // bytes
  allowedTypes: string[]
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_VALIDATION: FileValidation = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
}

const IMAGE_VALIDATION: FileValidation = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
}

const SUPABASE_NOT_CONFIGURED_ERROR = 'ファイルアップロード機能が設定されていません'

// =============================================================================
// Helper Functions
// =============================================================================

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

function generateFilePath(bucket: StorageBucket, filename: string, folder?: string): string {
  const ext = getFileExtension(filename)
  const uniqueId = uuid()
  const timestamp = Date.now()
  const basePath = folder ? `${folder}/` : ''
  return `${basePath}${timestamp}-${uniqueId}.${ext}`
}

function validateFile(file: File, validation: FileValidation): string | null {
  if (file.size > validation.maxSize) {
    const maxSizeMB = Math.round(validation.maxSize / (1024 * 1024))
    return `ファイルサイズは${maxSizeMB}MB以下にしてください`
  }

  if (!validation.allowedTypes.includes(file.type)) {
    return `対応していないファイル形式です。対応形式: ${validation.allowedTypes.join(', ')}`
  }

  return null
}

// =============================================================================
// Upload Functions
// =============================================================================

/**
 * 単一ファイルをアップロード
 */
export async function uploadFile(
  file: File,
  bucket: StorageBucket,
  options?: {
    folder?: string
    validation?: FileValidation
  }
): Promise<UploadResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: SUPABASE_NOT_CONFIGURED_ERROR }
  }

  const validation = options?.validation || DEFAULT_VALIDATION

  // バリデーション
  const validationError = validateFile(file, validation)
  if (validationError) {
    return { success: false, error: validationError }
  }

  try {
    const filePath = generateFilePath(bucket, file.name, options?.folder)

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      logError(new Error(error.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'uploadFile', bucket, filePath },
      })
      return { success: false, error: 'ファイルのアップロードに失敗しました' }
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'uploadFile', bucket },
    })
    return { success: false, error: 'ファイルのアップロードに失敗しました' }
  }
}

/**
 * 複数ファイルをアップロード
 */
export async function uploadFiles(
  files: File[],
  bucket: StorageBucket,
  options?: {
    folder?: string
    validation?: FileValidation
  }
): Promise<{ success: boolean; results: UploadResult[]; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, results: [], error: SUPABASE_NOT_CONFIGURED_ERROR }
  }

  const results: UploadResult[] = []

  for (const file of files) {
    const result = await uploadFile(file, bucket, options)
    results.push(result)

    if (!result.success) {
      return {
        success: false,
        results,
        error: `ファイル "${file.name}" のアップロードに失敗しました: ${result.error}`,
      }
    }
  }

  return { success: true, results }
}

/**
 * ファイルを削除
 */
export async function deleteFile(
  path: string,
  bucket: StorageBucket
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: SUPABASE_NOT_CONFIGURED_ERROR }
  }

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])

    if (error) {
      logError(new Error(error.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'deleteFile', bucket, path },
      })
      return { success: false, error: 'ファイルの削除に失敗しました' }
    }

    return { success: true }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteFile', bucket, path },
    })
    return { success: false, error: 'ファイルの削除に失敗しました' }
  }
}

/**
 * 複数ファイルを削除
 */
export async function deleteFiles(
  paths: string[],
  bucket: StorageBucket
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: SUPABASE_NOT_CONFIGURED_ERROR }
  }

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      logError(new Error(error.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'deleteFiles', bucket, pathCount: paths.length },
      })
      return { success: false, error: 'ファイルの削除に失敗しました' }
    }

    return { success: true }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteFiles', bucket, pathCount: paths.length },
    })
    return { success: false, error: 'ファイルの削除に失敗しました' }
  }
}

// =============================================================================
// Specialized Upload Functions
// =============================================================================

/**
 * スペース画像をアップロード
 */
export async function uploadSpaceImage(
  file: File,
  spaceId: string
): Promise<UploadResult> {
  return uploadFile(file, STORAGE_BUCKETS.SPACES, {
    folder: spaceId,
    validation: IMAGE_VALIDATION,
  })
}

/**
 * 投稿画像をアップロード
 */
export async function uploadPostImage(
  file: File,
  postId?: string
): Promise<UploadResult> {
  return uploadFile(file, STORAGE_BUCKETS.POSTS, {
    folder: postId || 'general',
    validation: IMAGE_VALIDATION,
  })
}

/**
 * サイト画像（ロゴ・ファビコン）をアップロード
 */
export async function uploadSiteImage(
  file: File,
  type: 'logo' | 'favicon' | 'ogp'
): Promise<UploadResult> {
  return uploadFile(file, STORAGE_BUCKETS.SITE, {
    folder: type,
    validation: {
      maxSize: 2 * 1024 * 1024, // 2MB
      allowedTypes: type === 'favicon'
        ? ['image/x-icon', 'image/png', 'image/svg+xml']
        : ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    },
  })
}

// =============================================================================
// URL Helpers
// =============================================================================

/**
 * Supabase Storage URLからパスを抽出
 */
export function extractPathFromUrl(url: string, bucket: StorageBucket): string | null {
  const pattern = new RegExp(`/storage/v1/object/public/${RegExp.escape(bucket)}/(.+)$`)
  const match = url.match(pattern)
  return match?.[1] ?? null
}

/**
 * パスからSupabase Storage URLを生成
 */
export function getPublicUrl(path: string, bucket: StorageBucket): string | null {
  if (!isSupabaseConfigured() || !supabase) {
    return null
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
