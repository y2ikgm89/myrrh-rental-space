import { supabase, STORAGE_BUCKETS, type StorageBucket } from './supabase'
import { v4 as uuid } from 'uuid'

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
      console.error('Supabase upload error:', error)
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
    console.error('Upload error:', error)
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
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])

    if (error) {
      console.error('Supabase delete error:', error)
      return { success: false, error: 'ファイルの削除に失敗しました' }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete error:', error)
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
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      console.error('Supabase delete error:', error)
      return { success: false, error: 'ファイルの削除に失敗しました' }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete error:', error)
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
 * ブログ画像をアップロード
 */
export async function uploadBlogImage(
  file: File,
  postId?: string
): Promise<UploadResult> {
  return uploadFile(file, STORAGE_BUCKETS.BLOG, {
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
  const pattern = new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`)
  const match = url.match(pattern)
  return match ? match[1] : null
}

/**
 * パスからSupabase Storage URLを生成
 */
export function getPublicUrl(path: string, bucket: StorageBucket): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
